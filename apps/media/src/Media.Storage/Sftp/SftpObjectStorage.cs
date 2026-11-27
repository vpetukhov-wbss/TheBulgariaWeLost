using System.Net.Sockets;
using System.Security.Cryptography;
using Microsoft.Extensions.Options;
using Renci.SshNet;
using Renci.SshNet.Common;

namespace Media.Storage.Sftp;

internal sealed class SftpObjectStorage(IOptions<SftpOptions> options) : IObjectStorage
{
    private readonly IReadOnlyDictionary<string, SftpProfile> profiles =
        new Dictionary<string, SftpProfile>(options.Value.Profiles, StringComparer.Ordinal);

    public IReadOnlyList<string> LocationIds => profiles.Keys.Order(StringComparer.Ordinal).ToArray();

    public bool HasLocation(string locationId) => profiles.ContainsKey(locationId);

    public async Task<StoredFile?> OpenReadAsync(string locationId, string fileKey, CancellationToken cancellationToken)
    {
        var profile = profiles[locationId];
        var path = FilePath(profile, fileKey);
        SftpClient? client = null;
        PrivateKeyFile? key = null;
        try
        {
            (client, key) = await ConnectAsync(profile, cancellationToken);
            var attributes = await client.GetAttributesAsync(path, cancellationToken);
            if (!attributes.IsRegularFile) throw new StorageFailure();
            var stream = await client.OpenAsync(path, FileMode.Open, FileAccess.Read, cancellationToken);
            var result = new StoredFile(new SftpReadStream(client, key, stream, attributes.Size), attributes.Size);
            client = null;
            key = null;
            return result;
        }
        catch (SftpPathNotFoundException)
        {
            return null;
        }
        catch (Exception ex) when (IsStorageError(ex))
        {
            throw new StorageFailure();
        }
        finally
        {
            client?.Dispose();
            key?.Dispose();
        }
    }

    public async Task PublishAsync(string locationId, string fileKey, Stream content, CancellationToken cancellationToken)
    {
        var profile = profiles[locationId];
        var path = FilePath(profile, fileKey);
        var (client, key) = await ConnectAsync(profile, cancellationToken);
        using (key)
        using (client)
        {
            var temp = $"{path}.{Guid.NewGuid():N}.part";
            try
            {
                await client.UploadFileAsync(content, temp, cancellationToken);
                // Standard SSH_FXP_RENAME fails if the target already exists.
                await client.RenameFileAsync(temp, path, cancellationToken);
            }
            catch (Exception ex) when (IsStorageError(ex))
            {
                if (!await ExistsAfterFailureAsync(client, path))
                    throw new StorageFailure();
                // Another lease may have finished first. The caller verifies the final bytes.
            }
            finally
            {
                await TryDeleteAsync(client, temp);
            }
        }
    }

    public async Task ProbeAsync(string locationId, CancellationToken cancellationToken)
    {
        byte[] marker = [0x21];
        var fileKey = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
        var profile = profiles[locationId];
        var temp = FilePath(profile, fileKey) + ".probe";
        var path = temp + ".verified";
        var (client, key) = await ConnectAsync(profile, cancellationToken);
        using (key)
        using (client)
        {
            try
            {
                using var input = new MemoryStream(marker, writable: false);
                await client.UploadFileAsync(input, temp, cancellationToken);
                await client.RenameFileAsync(temp, path, cancellationToken);
                await using (Stream read = await client.OpenAsync(path, FileMode.Open, FileAccess.Read, cancellationToken))
                {
                    var data = new byte[2];
                    var count = await read.ReadAtLeastAsync(data, 2, false, cancellationToken);
                    if (count != 1 || data[0] != marker[0]) throw new StorageFailure();
                }
                await client.DeleteFileAsync(path, cancellationToken);
            }
            catch (Exception ex) when (IsStorageError(ex))
            {
                throw new StorageFailure(ex is SftpPermissionDeniedException);
            }
            finally
            {
                await TryDeleteAsync(client, temp);
                await TryDeleteAsync(client, path);
            }
        }
    }

    public async Task CleanupExpiredPartialsAsync(DateTime cutoffUtc, CancellationToken cancellationToken)
    {
        foreach (var profile in profiles.Values)
        {
            var (client, key) = await ConnectAsync(profile, cancellationToken);
            using (key)
            using (client)
            {
                try
                {
                    await foreach (var file in client.ListDirectoryAsync(profile.Root, cancellationToken))
                    {
                        if (!file.IsRegularFile || !IsPartialName(file.Name)
                            || file.LastWriteTimeUtc > cutoffUtc)
                            continue;
                        await client.DeleteFileAsync(file.FullName, cancellationToken);
                    }
                }
                catch (Exception ex) when (IsStorageError(ex))
                {
                    throw new StorageFailure();
                }
            }
        }
    }

    private static string FilePath(SftpProfile profile, string fileKey)
    {
        if (!StorageModule.IsFileKey(fileKey)) throw new StorageFailure();
        return $"{profile.Root.TrimEnd('/')}/{fileKey}";
    }

    private static bool IsPartialName(string name)
    {
        const int keyLength = 64;
        const int attemptLength = 32;
        const string suffix = ".part";
        if (name.Length != keyLength + 1 + attemptLength + suffix.Length
            || name[keyLength] != '.' || !name.EndsWith(suffix, StringComparison.Ordinal))
            return false;
        return IsLowerHex(name.AsSpan(0, keyLength))
            && IsLowerHex(name.AsSpan(keyLength + 1, attemptLength));
    }

    private static bool IsLowerHex(ReadOnlySpan<char> value)
    {
        foreach (var character in value)
            if (character is not (>= 'a' and <= 'f' or >= '0' and <= '9'))
                return false;
        return true;
    }

    private static async Task<(SftpClient Client, PrivateKeyFile Key)> ConnectAsync(
        SftpProfile profile, CancellationToken cancellationToken)
    {
        PrivateKeyFile? key = null;
        SftpClient? client = null;
        var hostKeyRejected = false;
        try
        {
            await using var keyStream = new FileStream(profile.PrivateKeyPath, FileMode.Open, FileAccess.Read,
                FileShare.Read, 4096, FileOptions.Asynchronous);
            using var keyBuffer = new MemoryStream();
            await keyStream.CopyToAsync(keyBuffer, cancellationToken);
            var keyMaterial = keyBuffer.GetBuffer().AsMemory(0, (int)keyBuffer.Length);
            keyBuffer.Position = 0;
            try { key = new PrivateKeyFile(keyBuffer, profile.PrivateKeyPassphrase); }
            finally { CryptographicOperations.ZeroMemory(keyMaterial.Span); }

            var connection = new PrivateKeyConnectionInfo(profile.Host, profile.Port, profile.Username, key)
            {
                Timeout = TimeSpan.FromSeconds(5)
            };
            client = new SftpClient(connection) { OperationTimeout = TimeSpan.FromSeconds(8) };
            client.HostKeyReceived += (_, args) =>
            {
                var fingerprint = "SHA256:" + Convert.ToBase64String(SHA256.HashData(args.HostKey)).TrimEnd('=');
                args.CanTrust = string.Equals(fingerprint, profile.HostKeySha256, StringComparison.Ordinal);
                hostKeyRejected = !args.CanTrust;
            };
            await client.ConnectAsync(cancellationToken);
            return (client, key);
        }
        catch (Exception ex)
        {
            client?.Dispose();
            key?.Dispose();
            if (IsStorageError(ex)) throw new StorageFailure(hostKeyRejected || ex is SshAuthenticationException);
            throw;
        }
    }

    private static async Task<bool> ExistsAfterFailureAsync(SftpClient client, string path)
    {
        using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        try { return client.IsConnected && await client.ExistsAsync(path, cleanup.Token); }
        catch (Exception ex) when (IsStorageError(ex) || ex is OperationCanceledException) { return false; }
    }

    private static async Task TryDeleteAsync(SftpClient client, string path)
    {
        using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        try
        {
            if (client.IsConnected) await client.DeleteFileAsync(path, cleanup.Token);
        }
        catch (Exception ex) when (IsStorageError(ex) || ex is OperationCanceledException)
        {
            // Temporary objects never become readable through the media API.
        }
    }

    private static bool IsStorageError(Exception ex) =>
        ex is SshException or SocketException or IOException or UnauthorizedAccessException;
}
