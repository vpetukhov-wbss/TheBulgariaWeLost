using System.Collections.Concurrent;
using Microsoft.Extensions.Options;

namespace Media.Transfers.Upload;

internal sealed class UploadQuarantine
{
    private static readonly UnixFileMode PrivateDirectoryMode =
        UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute;
    private static readonly UnixFileMode PrivateFileMode =
        UnixFileMode.UserRead | UnixFileMode.UserWrite;

    private readonly ConcurrentDictionary<string, byte> active = new(StringComparer.Ordinal);
    private readonly string directory;

    public UploadQuarantine(IOptions<TransferOptions> options)
    {
        directory = Path.GetFullPath(options.Value.QuarantineDirectory);
        if (OperatingSystem.IsWindows())
            Directory.CreateDirectory(directory);
        else
        {
            Directory.CreateDirectory(directory, PrivateDirectoryMode);
            File.SetUnixFileMode(directory, PrivateDirectoryMode);
        }
    }

    public QuarantineFile Create(
        Guid uploadId, Guid attemptId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var path = Path.Combine(directory, $"{uploadId:N}.{attemptId:N}.upload");
        if (!active.TryAdd(path, 0)) throw new IOException("The upload attempt is already active.");
        try
        {
            var fileOptions = new FileStreamOptions
            {
                Mode = FileMode.CreateNew,
                Access = FileAccess.ReadWrite,
                Share = FileShare.None,
                BufferSize = 64 * 1024,
                Options = FileOptions.Asynchronous | FileOptions.SequentialScan
            };
            if (!OperatingSystem.IsWindows()) fileOptions.UnixCreateMode = PrivateFileMode;
            var content = new FileStream(path, fileOptions);
            return new QuarantineFile(path, content, Release);
        }
        catch
        {
            Release(path);
            throw;
        }
    }

    public int CleanupExpired(DateTime cutoffUtc)
    {
        var deleted = 0;
        foreach (var path in Directory.EnumerateFiles(directory, "*.upload", new EnumerationOptions
        {
            RecurseSubdirectories = false,
            IgnoreInaccessible = true,
            AttributesToSkip = FileAttributes.ReparsePoint
        }))
        {
            if (active.ContainsKey(path)) continue;
            var name = Path.GetFileName(path);
            try
            {
                if (!IsManagedName(name) || File.GetLastWriteTimeUtc(path) > cutoffUtc)
                    continue;
                File.Delete(path);
                deleted++;
            }
            catch (FileNotFoundException)
            {
                // Another cleanup pass already removed the expired file.
            }
            catch (IOException)
            {
                // An active upload owns the file exclusively and is not removed.
            }
            catch (UnauthorizedAccessException)
            {
                // Keep the private file for the next cleanup attempt.
            }
        }
        return deleted;
    }

    private void Release(string path) => active.TryRemove(path, out _);

    private static bool IsManagedName(string name)
    {
        const int identifierLength = 32;
        const string suffix = ".upload";
        if (name.Length != identifierLength + 1 + identifierLength + suffix.Length
            || name[identifierLength] != '.' || !name.EndsWith(suffix, StringComparison.Ordinal))
            return false;
        return IsLowerHex(name.AsSpan(0, identifierLength))
            && IsLowerHex(name.AsSpan(identifierLength + 1, identifierLength));
    }

    private static bool IsLowerHex(ReadOnlySpan<char> value)
    {
        foreach (var character in value)
            if (character is not (>= 'a' and <= 'f' or >= '0' and <= '9'))
                return false;
        return true;
    }
}

internal sealed class QuarantineFile(
    string path, FileStream content, Action<string> release) : IAsyncDisposable
{
    private int disposed;

    public FileStream Content { get; } = content;

    public async Task DeleteAsync()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        try
        {
            await Content.DisposeAsync();
            File.Delete(path);
        }
        finally
        {
            release(path);
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        try { await Content.DisposeAsync(); }
        finally { release(path); }
    }
}
