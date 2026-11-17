using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using Media.ControlPlane;
using Media.Storage;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Media.IntegrationTests;

internal sealed class MediaApp : WebApplicationFactory<Program>
{
    public static readonly Guid UploadId = Guid.Parse("11111111-1111-4111-8111-111111111111");
    public const string FileKey = "aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111";
    public const string ProbeToken = "test-only-probe-credential-408a14f1f1";
    public static readonly byte[] Png = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ab8x4sAAAAASUVORK5CYII=");

    private readonly string quarantine = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
    public FakeStorage Storage { get; } = new();
    public ControlFixtures Control { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration(config => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["MediaControl:BaseUrl"] = "http://api:3000/",
            ["MediaControl:ServiceToken"] = "test-only-outbound-credential-2c39b4c67",
            ["MediaControl:ProbeToken"] = ProbeToken,
            ["MediaTransfers:QuarantineDirectory"] = quarantine
        }));
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IObjectStorage>();
            services.AddSingleton<IObjectStorage>(Storage);
            services.AddHttpClient<MediaControlClient>().ConfigurePrimaryHttpMessageHandler(() => Control);
        });
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        if (Directory.Exists(quarantine)) Directory.Delete(quarantine, recursive: true);
    }

    public static string Sha256(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));

    internal sealed class FakeStorage : IObjectStorage
    {
        public byte[]? Bytes { get; set; }
        public int Publications { get; private set; }
        public int ProbeCount { get; private set; }
        public int Opens { get; private set; }

        public bool HasLocation(string locationId) => locationId == "archive";

        public Task<StoredFile?> OpenReadAsync(string locationId, string fileKey, CancellationToken cancellationToken)
        {
            Opens++;
            return Task.FromResult(Bytes is null ? null : new StoredFile(new MemoryStream(Bytes), Bytes.Length));
        }

        public async Task PublishAsync(string locationId, string fileKey, Stream content, CancellationToken cancellationToken)
        {
            Publications++;
            using var buffer = new MemoryStream();
            await content.CopyToAsync(buffer, cancellationToken);
            Bytes ??= buffer.ToArray();
        }

        public Task ProbeAsync(string locationId, CancellationToken cancellationToken)
        {
            ProbeCount++;
            return Task.CompletedTask;
        }
    }

    internal sealed class ControlFixtures : HttpMessageHandler
    {
        public bool Deny { get; set; }
        public bool FailNextCompletion { get; set; }
        public int ReadChecks { get; private set; }
        public List<UploadReceipt> Receipts { get; } = [];
        public byte[] ExpectedBytes { get; set; } = Png;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.Headers.Authorization?.Parameter != "test-only-outbound-credential-2c39b4c67")
                return new HttpResponseMessage(HttpStatusCode.Unauthorized);

            var path = request.RequestUri?.AbsolutePath;
            var location = new ObjectReference("archive", FileKey);
            if (path?.EndsWith("/authorize-read", StringComparison.Ordinal) == true)
            {
                ReadChecks++;
                return Deny ? new HttpResponseMessage(HttpStatusCode.Forbidden)
                    : Json(new ReadDecision(location, ExpectedBytes.Length, "image/png"));
            }
            if (path?.EndsWith("/claim", StringComparison.Ordinal) == true)
                return Deny ? new HttpResponseMessage(HttpStatusCode.Forbidden)
                    : Json(new UploadClaim(Guid.NewGuid(), location, ExpectedBytes.Length, Sha256(ExpectedBytes)));
            if (path?.EndsWith("/complete", StringComparison.Ordinal) == true && request.Content is not null)
            {
                if (FailNextCompletion)
                {
                    FailNextCompletion = false;
                    return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
                }
                var receipt = await request.Content.ReadFromJsonAsync<UploadReceipt>(cancellationToken);
                if (receipt is null) return new HttpResponseMessage(HttpStatusCode.BadRequest);
                Receipts.Add(receipt);
                return new HttpResponseMessage(HttpStatusCode.NoContent);
            }
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        }

        private static HttpResponseMessage Json<T>(T value) =>
            new(HttpStatusCode.OK) { Content = JsonContent.Create(value) };
    }
}
