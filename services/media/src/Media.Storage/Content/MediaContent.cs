using System.Buffers;
using System.Security.Cryptography;

namespace Media.Storage.Content;

public sealed record MediaContent(long Length, string Sha256, string? ContentType)
{
    public bool Matches(long length, string sha256) =>
        Length == length && string.Equals(Sha256, sha256, StringComparison.OrdinalIgnoreCase);

    public static bool SupportedType(string? contentType) => contentType is "image/jpeg" or "image/png" or "application/pdf";

    public static bool ValidSha256(string? sha256) =>
        sha256 is { Length: 64 } && sha256.All(Uri.IsHexDigit);

    public static async Task<MediaContent?> InspectAsync(
        Stream input, long limit, Stream? copyTo, CancellationToken cancellationToken)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var prefix = new byte[8];
        var prefixLength = 0;
        var length = 0L;
        var buffer = ArrayPool<byte>.Shared.Rent(64 * 1024);
        try
        {
            while (true)
            {
                // Read at most one byte beyond the limit to distinguish EOF from overflow.
                var count = (int)Math.Min(buffer.Length, limit - length + 1);
                var read = await input.ReadAsync(buffer.AsMemory(0, count), cancellationToken);
                if (read == 0) break;
                if (read > limit - length) return null;

                var copy = Math.Min(prefix.Length - prefixLength, read);
                buffer.AsSpan(0, copy).CopyTo(prefix.AsSpan(prefixLength));
                prefixLength += copy;
                hash.AppendData(buffer.AsSpan(0, read));
                length += read;

                if (copyTo is not null) await copyTo.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
            }

            return new MediaContent(length, Convert.ToHexStringLower(hash.GetHashAndReset()),
                DetectType(prefix.AsSpan(0, prefixLength)));
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer, clearArray: true);
        }
    }

    private static string? DetectType(ReadOnlySpan<byte> prefix)
    {
        ReadOnlySpan<byte> png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        ReadOnlySpan<byte> jpeg = [0xFF, 0xD8, 0xFF];
        if (prefix.StartsWith(png)) return "image/png";
        if (prefix.StartsWith(jpeg)) return "image/jpeg";
        return prefix.StartsWith("%PDF-"u8) ? "application/pdf" : null;
    }
}
