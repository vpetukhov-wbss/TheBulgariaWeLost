using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Media.ControlPlane;
using Media.Processing.Inspection;
using Media.Storage.Content;
using Media.Transfers;
using Media.Transfers.Upload;
using Microsoft.Extensions.Options;
using Xunit;

namespace Media.IntegrationTests;

public sealed class TransferTests
{
    [Fact]
    public async Task Development_OpenAPI_lists_the_transfer_routes()
    {
        await using var app = new MediaApp();
        using var client = app.CreateClient();

        using var response = await client.GetAsync("/media/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var paths = document.RootElement.GetProperty("paths");
        Assert.True(paths.GetProperty("/media/v1/uploads/{uploadId}").TryGetProperty("put", out _));
        Assert.True(paths.GetProperty("/media/v1/assets/{assetId}/{variant}").TryGetProperty("get", out _));
    }

    [Fact]
    public async Task Responses_echo_the_correlation_id()
    {
        await using var app = new MediaApp();
        using var client = app.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/media/health/live");
        request.Headers.Add("X-Correlation-ID", "media-contract-smoke-1");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("media-contract-smoke-1", response.Headers.GetValues("X-Correlation-ID").Single());
    }

    [Fact]
    public async Task Retrying_after_failed_acknowledgement_does_not_publish_a_second_object()
    {
        await using var app = new MediaApp();
        using var client = app.CreateClient();
        app.Control.FailNextCompletion = true;

        using var first = await UploadAsync(client, MediaApp.Png);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, first.StatusCode);
        Assert.Equal(MediaApp.Png, app.Storage.Bytes);

        using var retry = await UploadAsync(client, []);
        Assert.Equal(HttpStatusCode.NoContent, retry.StatusCode);
        Assert.Equal(1, app.Storage.Publications);
        Assert.Empty(Directory.GetFiles(app.QuarantineDirectory, "*.upload"));
        var receipt = Assert.Single(app.Control.Receipts);
        Assert.Equal(MediaApp.Sha256(MediaApp.Png), receipt.Sha256);
        Assert.Equal("image/png", receipt.ContentType);
    }

    [Fact]
    public async Task Upload_requires_current_control_plane_authorization()
    {
        await using var app = new MediaApp();
        using var client = app.CreateClient();
        app.Control.Deny = true;

        using var response = await UploadAsync(client, MediaApp.Png);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, app.Storage.Opens);
        Assert.Empty(app.Control.Receipts);
    }

    [Fact]
    public async Task Unknown_format_is_rejected_without_writing_or_confirming()
    {
        await using var app = new MediaApp();
        using var client = app.CreateClient();
        app.Control.ExpectedBytes = "not a PNG, JPEG, or PDF"u8.ToArray();

        using var response = await UploadAsync(client, app.Control.ExpectedBytes);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
        Assert.Equal(0, app.Storage.Publications);
        Assert.Empty(app.Control.Receipts);
        AssertPrivateQuarantineFile(app.QuarantineDirectory);
    }

    [Fact]
    public async Task Wrong_checksum_is_rejected_before_publishing()
    {
        await using var app = new MediaApp();
        using var client = app.CreateClient();
        var mutated = MediaApp.Png.ToArray();
        mutated[40] ^= 1;

        using var response = await UploadAsync(client, mutated);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(0, app.Storage.Publications);
        AssertPrivateQuarantineFile(app.QuarantineDirectory);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(422, problem.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("upload_integrity_mismatch", problem.RootElement.GetProperty("code").GetString());
        Assert.Equal(response.Headers.GetValues("X-Correlation-ID").Single(),
            problem.RootElement.GetProperty("traceId").GetString());
    }

    [Fact]
    public async Task Structurally_invalid_image_and_PDF_headers_are_quarantined()
    {
        await using var app = new MediaApp();
        using var client = app.CreateClient();
        byte[][] malformed =
        [
            [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00],
            [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02],
            "%PDF-1.7\nmissing end marker"u8.ToArray()
        ];

        foreach (var bytes in malformed)
        {
            app.Control.ExpectedBytes = bytes;
            using var response = await UploadAsync(client, bytes);
            Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
        }

        Assert.Equal(malformed.Length, Directory.GetFiles(app.QuarantineDirectory, "*.upload").Length);
        Assert.Equal(0, app.Storage.Publications);
    }

    [Fact]
    public async Task Interrupted_streaming_copy_remains_in_quarantine()
    {
        var directory = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        try
        {
            var quarantine = new UploadQuarantine(Options.Create(new TransferOptions
            {
                QuarantineDirectory = directory
            }));
            using var input = new InterruptedReadStream(MediaApp.Png);
            await using (var file = quarantine.Create(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None))
            {
                await Assert.ThrowsAsync<IOException>(() => MediaContent.InspectAsync(
                    input, MediaApp.Png.Length, file.Content, CancellationToken.None));
            }

            var path = AssertPrivateQuarantineFile(directory);
            Assert.Equal(MediaApp.Png[..(MediaApp.Png.Length / 2)], await File.ReadAllBytesAsync(path));
        }
        finally
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public async Task Expired_quarantine_file_is_removed_by_the_owned_cleanup_worker()
    {
        await using var app = new MediaApp();
        using var client = app.CreateClient();
        app.Control.ExpectedBytes = "invalid"u8.ToArray();
        using var response = await UploadAsync(client, app.Control.ExpectedBytes);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
        var path = Assert.Single(Directory.GetFiles(app.QuarantineDirectory, "*.upload"));
        File.SetLastWriteTimeUtc(path, DateTime.UtcNow.AddMinutes(-2));

        await EventuallyAsync(
            () => !File.Exists(path),
            TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task Inspection_extracts_bounded_image_dimensions()
    {
        using var stream = new MemoryStream(MediaApp.Png, writable: false);
        var content = await MediaContent.InspectAsync(
            stream, MediaApp.Png.Length, null, CancellationToken.None);

        Assert.NotNull(content);
        Assert.Equal("image/png", content.ContentType);
        Assert.Equal(1, content.Width);
        Assert.Equal(1, content.Height);
    }

    [Fact]
    public async Task Inspection_publishes_an_attempt_specific_verified_preview()
    {
        var storage = new MediaApp.FakeStorage { Bytes = MediaApp.Png };
        var previewKey = new string('b', 64);
        var lease = new InspectionLease(
            Guid.NewGuid(),
            Guid.NewGuid(),
            new ObjectReference("archive", MediaApp.FileKey),
            new ObjectReference("archive", previewKey),
            MediaApp.Png.Length,
            MediaApp.Sha256(MediaApp.Png));

        var result = await InspectionProcessor.ProcessAsync(
            lease, storage, CancellationToken.None);

        Assert.Equal("inspected", result.Outcome);
        Assert.Equal(lease.AttemptId, result.AttemptId);
        Assert.Equal(lease.PreviewObject, result.PreviewObject);
        Assert.Equal(MediaApp.Png, storage.BytesFor(previewKey));
        Assert.Equal(MediaApp.Sha256(MediaApp.Png), result.PreviewSha256);
        Assert.Equal("image/png", result.PreviewContentType);
    }

    [Fact]
    public async Task Every_range_request_rechecks_access_and_bypasses_caches()
    {
        await using var app = new MediaApp();
        using var client = app.CreateClient();
        app.Storage.Bytes = MediaApp.Png;
        var url = $"/media/v1/assets/{MediaApp.UploadId:D}/preview?grant={MediaApp.ReadGrant}";
        using var first = new HttpRequestMessage(HttpMethod.Get, url);
        first.Headers.Range = new RangeHeaderValue(0, 3);
        using var allowed = await client.SendAsync(first);

        Assert.Equal(HttpStatusCode.PartialContent, allowed.StatusCode);
        Assert.Equal(MediaApp.Png[..4], await allowed.Content.ReadAsByteArrayAsync());
        Assert.True(allowed.Headers.CacheControl?.NoStore);

        app.Control.Deny = true;
        using var second = new HttpRequestMessage(HttpMethod.Get, url);
        second.Headers.Range = new RangeHeaderValue(4, 7);
        using var denied = await client.SendAsync(second);
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.Equal(2, app.Control.ReadChecks);
        Assert.Equal(1, app.Storage.Opens);
    }

    [Fact]
    public async Task Storage_probe_requires_its_own_service_credential()
    {
        await using var app = new MediaApp();
        using var client = app.CreateClient();
        const string path = "/internal/media/v1/storage/archive/probe";
        using var denied = await client.PostAsync(path, null);
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);

        using var request = new HttpRequestMessage(HttpMethod.Post, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", MediaApp.ProbeToken);
        using var accepted = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.NoContent, accepted.StatusCode);
        Assert.Equal(1, app.Storage.ProbeCount);
    }

    private static async Task<HttpResponseMessage> UploadAsync(HttpClient client, byte[] bytes)
    {
        return await UploadAsync(client, new ByteArrayContent(bytes));
    }

    private static async Task<HttpResponseMessage> UploadAsync(HttpClient client, HttpContent content)
    {
        using var request = new HttpRequestMessage(HttpMethod.Put, $"/media/v1/uploads/{MediaApp.UploadId:D}")
        {
            Content = content
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", MediaApp.UploadGrant);
        return await client.SendAsync(request);
    }

    private static string AssertPrivateQuarantineFile(string directory)
    {
        var path = Assert.Single(Directory.GetFiles(directory, "*.upload"));
        if (!OperatingSystem.IsWindows())
        {
            Assert.Equal(
                UnixFileMode.UserRead | UnixFileMode.UserWrite,
                File.GetUnixFileMode(path));
            Assert.Equal(
                UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute,
                File.GetUnixFileMode(directory));
        }
        return path;
    }

    private static async Task EventuallyAsync(Func<bool> condition, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (!condition())
        {
            if (DateTime.UtcNow >= deadline)
                throw new TimeoutException("The expected cleanup did not finish within the bounded timeout.");
            await Task.Delay(TimeSpan.FromMilliseconds(50));
        }
    }

    private sealed class InterruptedReadStream : MemoryStream
    {
        private readonly int firstReadLength;
        private bool interrupted;

        public InterruptedReadStream(byte[] bytes) : base(bytes, writable: false)
        {
            firstReadLength = bytes.Length / 2;
        }

        public override ValueTask<int> ReadAsync(
            Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (interrupted)
                return ValueTask.FromException<int>(new IOException("Simulated interrupted request body."));

            interrupted = true;
            return base.ReadAsync(buffer[..Math.Min(buffer.Length, firstReadLength)], cancellationToken);
        }
    }
}
