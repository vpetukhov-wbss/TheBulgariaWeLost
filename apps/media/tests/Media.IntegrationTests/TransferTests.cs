using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
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
    }

    [Fact]
    public async Task Wrong_checksum_is_rejected_before_publishing()
    {
        await using var app = new MediaApp();
        using var client = app.CreateClient();
        var mutated = MediaApp.Png.ToArray();
        mutated[^1] ^= 1;

        using var response = await UploadAsync(client, mutated);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(0, app.Storage.Publications);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(422, problem.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("upload_integrity_mismatch", problem.RootElement.GetProperty("code").GetString());
        Assert.Equal(response.Headers.GetValues("X-Correlation-ID").Single(),
            problem.RootElement.GetProperty("traceId").GetString());
    }

    [Fact]
    public async Task Every_range_request_rechecks_access_and_bypasses_caches()
    {
        await using var app = new MediaApp();
        using var client = app.CreateClient();
        app.Storage.Bytes = MediaApp.Png;
        var url = $"/media/v1/assets/{MediaApp.UploadId:D}/preview?grant=signature";
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
        using var request = new HttpRequestMessage(HttpMethod.Put, $"/media/v1/uploads/{MediaApp.UploadId:D}")
        {
            Content = new ByteArrayContent(bytes)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "upload-grant");
        return await client.SendAsync(request);
    }
}
