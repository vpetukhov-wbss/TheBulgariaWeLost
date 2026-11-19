using System.Security.Cryptography;
using Media.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Renci.SshNet;
using Xunit;

namespace Media.IntegrationTests;

public sealed class SftpStorageTests
{
    [Fact]
    public async Task Private_SFTP_pins_the_host_key_and_fails_closed_when_unavailable()
    {
        var settings = TestSftpSettings.Load();
        if (settings is null) return;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));

        await using (var wrongHost = BuildStorage(
                         settings, "SHA256:" + new string('A', 43), settings.Port))
        {
            var storage = wrongHost.GetRequiredService<IObjectStorage>();
            await Assert.ThrowsAsync<StorageFailure>(
                () => storage.ProbeAsync("archive", timeout.Token));
        }

        await using (var unavailable = BuildStorage(settings, settings.HostKeySha256, 1))
        {
            var storage = unavailable.GetRequiredService<IObjectStorage>();
            await Assert.ThrowsAsync<StorageFailure>(
                () => storage.ProbeAsync("archive", timeout.Token));
        }
    }

    [Fact]
    public async Task Publish_is_atomic_repetition_keeps_the_original_and_expired_partials_are_cleaned()
    {
        var settings = TestSftpSettings.Load();
        if (settings is null) return;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        await using var services = BuildStorage(settings, settings.HostKeySha256, settings.Port);
        var storage = services.GetRequiredService<IObjectStorage>();
        var fileKey = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
        var partial = $"{settings.Root.TrimEnd('/')}/{fileKey}.{Guid.NewGuid():N}.part";
        var unrelated = $"{settings.Root.TrimEnd('/')}/unmanaged-{Guid.NewGuid():N}.part";

        try
        {
            using (var first = new MemoryStream(MediaApp.Png, writable: false))
                await storage.PublishAsync("archive", fileKey, first, timeout.Token);

            var changed = MediaApp.Png.ToArray();
            changed[^1] ^= 1;
            using (var second = new MemoryStream(changed, writable: false))
                await storage.PublishAsync("archive", fileKey, second, timeout.Token);

            var stored = await storage.OpenReadAsync("archive", fileKey, timeout.Token);
            Assert.NotNull(stored);
            await using (stored)
            {
                using var bytes = new MemoryStream();
                await stored.Content.CopyToAsync(bytes, timeout.Token);
                Assert.Equal(MediaApp.Png, bytes.ToArray());
            }

            using (var connection = await ConnectAsync(settings, timeout.Token))
            {
                var client = connection.Client;
                using var marker = new MemoryStream([0x21], writable: false);
                await client.UploadFileAsync(marker, partial, timeout.Token);
                marker.Position = 0;
                await client.UploadFileAsync(marker, unrelated, timeout.Token);
            }

            await storage.CleanupExpiredPartialsAsync(DateTime.UtcNow.AddMinutes(1), timeout.Token);

            using (var connection = await ConnectAsync(settings, timeout.Token))
            {
                var client = connection.Client;
                Assert.False(await client.ExistsAsync(partial, timeout.Token));
                Assert.True(await client.ExistsAsync(unrelated, timeout.Token));
            }
        }
        finally
        {
            using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            using var connection = await ConnectAsync(settings, cleanup.Token);
            var client = connection.Client;
            await DeleteIfPresentAsync(client, $"{settings.Root.TrimEnd('/')}/{fileKey}", cleanup.Token);
            await DeleteIfPresentAsync(client, partial, cleanup.Token);
            await DeleteIfPresentAsync(client, unrelated, cleanup.Token);
        }
    }

    private static ServiceProvider BuildStorage(
        TestSftpSettings settings, string fingerprint, int port)
    {
        var values = new Dictionary<string, string?>
        {
            ["MediaStorage:PartialRetentionMinutes"] = "60",
            ["MediaStorage:CleanupIntervalSeconds"] = "300",
            ["MediaStorage:Profiles:archive:Host"] = settings.Host,
            ["MediaStorage:Profiles:archive:Port"] = port.ToString(),
            ["MediaStorage:Profiles:archive:Username"] = settings.Username,
            ["MediaStorage:Profiles:archive:PrivateKeyPath"] = settings.PrivateKeyPath,
            ["MediaStorage:Profiles:archive:HostKeySha256"] = fingerprint,
            ["MediaStorage:Profiles:archive:Root"] = settings.Root
        };
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddMediaStorage(configuration);
        return services.BuildServiceProvider();
    }

    private static async Task<SftpConnection> ConnectAsync(
        TestSftpSettings settings, CancellationToken cancellationToken)
    {
        var key = new PrivateKeyFile(settings.PrivateKeyPath);
        var connection = new PrivateKeyConnectionInfo(
            settings.Host, settings.Port, settings.Username, key);
        var client = new SftpClient(connection);
        client.HostKeyReceived += (_, args) =>
        {
            var fingerprint = "SHA256:"
                + Convert.ToBase64String(SHA256.HashData(args.HostKey)).TrimEnd('=');
            args.CanTrust = string.Equals(
                fingerprint, settings.HostKeySha256, StringComparison.Ordinal);
        };
        try
        {
            await client.ConnectAsync(cancellationToken);
            return new SftpConnection(client, key);
        }
        catch
        {
            client.Dispose();
            key.Dispose();
            throw;
        }
    }

    private sealed class SftpConnection(SftpClient client, PrivateKeyFile key) : IDisposable
    {
        public SftpClient Client { get; } = client;

        public void Dispose()
        {
            Client.Dispose();
            key.Dispose();
        }
    }

    private static async Task DeleteIfPresentAsync(
        SftpClient client, string path, CancellationToken cancellationToken)
    {
        if (await client.ExistsAsync(path, cancellationToken))
            await client.DeleteFileAsync(path, cancellationToken);
    }

    private sealed record TestSftpSettings(
        string Host,
        int Port,
        string Username,
        string PrivateKeyPath,
        string HostKeySha256,
        string Root)
    {
        public static TestSftpSettings? Load()
        {
            var required = string.Equals(
                Environment.GetEnvironmentVariable("MEDIA_TEST_SFTP_REQUIRED"),
                "true",
                StringComparison.OrdinalIgnoreCase);
            var host = Environment.GetEnvironmentVariable("MEDIA_TEST_SFTP_HOST");
            var username = Environment.GetEnvironmentVariable("MEDIA_TEST_SFTP_USERNAME");
            var key = Environment.GetEnvironmentVariable("MEDIA_TEST_SFTP_PRIVATE_KEY");
            var fingerprint = Environment.GetEnvironmentVariable("MEDIA_TEST_SFTP_HOST_KEY_SHA256");
            var root = Environment.GetEnvironmentVariable("MEDIA_TEST_SFTP_ROOT");
            var portText = Environment.GetEnvironmentVariable("MEDIA_TEST_SFTP_PORT");
            if (host is null || username is null || key is null || fingerprint is null || root is null
                || !int.TryParse(portText, out var port))
            {
                Assert.False(required, "The required private SFTP integration fixture is incomplete.");
                return null;
            }
            return new TestSftpSettings(host, port, username, key, fingerprint, root);
        }
    }
}
