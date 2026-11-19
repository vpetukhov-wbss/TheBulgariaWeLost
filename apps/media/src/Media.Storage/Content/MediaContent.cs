using System.Buffers;
using System.Buffers.Binary;
using System.Security.Cryptography;

namespace Media.Storage.Content;

public sealed record MediaContent(
    long Length,
    string Sha256,
    string? ContentType,
    int? Width = null,
    int? Height = null)
{
    private const int MetadataPrefixBytes = 256 * 1024;
    private const int TailBytes = 1024;
    private const int MaxDimension = 50_000;
    private const long MaxPixels = 100_000_000;

    public bool Matches(long length, string sha256) =>
        Length == length && string.Equals(Sha256, sha256, StringComparison.OrdinalIgnoreCase);

    public static bool SupportedType(string? contentType) => contentType is "image/jpeg" or "image/png" or "application/pdf";

    public static bool ValidSha256(string? sha256) =>
        sha256 is { Length: 64 } && sha256.All(Uri.IsHexDigit);

    public static async Task<MediaContent?> InspectAsync(
        Stream input, long limit, Stream? copyTo, CancellationToken cancellationToken)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var prefix = new byte[MetadataPrefixBytes];
        var prefixLength = 0;
        var tail = new byte[TailBytes];
        var tailLength = 0;
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
                UpdateTail(tail, ref tailLength, buffer.AsSpan(0, read));
                hash.AppendData(buffer.AsSpan(0, read));
                length += read;

                if (copyTo is not null) await copyTo.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
            }

            var metadata = DetectMetadata(
                prefix.AsSpan(0, prefixLength), tail.AsSpan(0, tailLength));
            return new MediaContent(
                length,
                Convert.ToHexStringLower(hash.GetHashAndReset()),
                metadata.ContentType,
                metadata.Width,
                metadata.Height);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer, clearArray: true);
        }
    }

    private static void UpdateTail(byte[] tail, ref int tailLength, ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length >= tail.Length)
        {
            bytes[^tail.Length..].CopyTo(tail);
            tailLength = tail.Length;
            return;
        }

        var retained = Math.Min(tailLength, tail.Length - bytes.Length);
        if (retained > 0)
            tail.AsSpan(tailLength - retained, retained).CopyTo(tail);
        bytes.CopyTo(tail.AsSpan(retained));
        tailLength = retained + bytes.Length;
    }

    private static ContentMetadata DetectMetadata(ReadOnlySpan<byte> prefix, ReadOnlySpan<byte> tail)
    {
        ReadOnlySpan<byte> png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        ReadOnlySpan<byte> jpeg = [0xFF, 0xD8];
        if (prefix.StartsWith(png)) return InspectPng(prefix, tail);
        if (prefix.StartsWith(jpeg)) return InspectJpeg(prefix, tail);
        if (prefix.StartsWith("%PDF-"u8)) return InspectPdf(prefix, tail);
        return default;
    }

    private static ContentMetadata InspectPng(ReadOnlySpan<byte> prefix, ReadOnlySpan<byte> tail)
    {
        ReadOnlySpan<byte> ending = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82];
        if (prefix.Length < 29 || !tail.EndsWith(ending)
            || BinaryPrimitives.ReadInt32BigEndian(prefix[8..12]) != 13
            || !prefix[12..16].SequenceEqual("IHDR"u8))
            return default;

        var width = BinaryPrimitives.ReadInt32BigEndian(prefix[16..20]);
        var height = BinaryPrimitives.ReadInt32BigEndian(prefix[20..24]);
        var bitDepth = prefix[24];
        var colorType = prefix[25];
        if (!ValidDimensions(width, height) || !ValidPngDepth(bitDepth, colorType)
            || prefix[26] != 0 || prefix[27] != 0 || prefix[28] > 1)
            return default;
        return new ContentMetadata("image/png", width, height);
    }

    private static ContentMetadata InspectJpeg(ReadOnlySpan<byte> prefix, ReadOnlySpan<byte> tail)
    {
        if (tail.Length < 2 || tail[^2] != 0xFF || tail[^1] != 0xD9)
            return default;

        var offset = 2;
        while (offset < prefix.Length)
        {
            while (offset < prefix.Length && prefix[offset] == 0xFF) offset++;
            if (offset >= prefix.Length) return default;
            var marker = prefix[offset++];
            if (marker is 0xD8 or 0x01 or >= 0xD0 and <= 0xD7) continue;
            if (marker is 0xD9 or 0xDA || offset + 2 > prefix.Length) return default;

            var segmentLength = BinaryPrimitives.ReadUInt16BigEndian(prefix[offset..(offset + 2)]);
            if (segmentLength < 2 || offset + segmentLength > prefix.Length) return default;
            if (IsStartOfFrame(marker))
            {
                if (segmentLength < 8) return default;
                var precision = prefix[offset + 2];
                var height = BinaryPrimitives.ReadUInt16BigEndian(prefix[(offset + 3)..(offset + 5)]);
                var width = BinaryPrimitives.ReadUInt16BigEndian(prefix[(offset + 5)..(offset + 7)]);
                var components = prefix[offset + 7];
                return components is >= 1 and <= 4 && segmentLength == 8 + 3 * components
                    && precision is 8 or 12 && ValidDimensions(width, height)
                    ? new ContentMetadata("image/jpeg", width, height)
                    : default;
            }
            offset += segmentLength;
        }
        return default;
    }

    private static ContentMetadata InspectPdf(ReadOnlySpan<byte> prefix, ReadOnlySpan<byte> tail)
    {
        if (prefix.Length < 8 || prefix[5] is not (>= (byte)'1' and <= (byte)'2')
            || prefix[6] != '.' || prefix[7] is not (>= (byte)'0' and <= (byte)'9'))
            return default;
        var marker = tail.LastIndexOf("%%EOF"u8);
        if (marker < 0) return default;
        foreach (var value in tail[(marker + 5)..])
            if (value is not ((byte)' ' or (byte)'\t' or (byte)'\r' or (byte)'\n'))
                return default;
        return new ContentMetadata("application/pdf", null, null);
    }

    private static bool ValidDimensions(int width, int height) =>
        width is > 0 and <= MaxDimension && height is > 0 and <= MaxDimension
        && (long)width * height <= MaxPixels;

    private static bool ValidPngDepth(byte depth, byte colorType) => colorType switch
    {
        0 => depth is 1 or 2 or 4 or 8 or 16,
        2 or 4 or 6 => depth is 8 or 16,
        3 => depth is 1 or 2 or 4 or 8,
        _ => false
    };

    private static bool IsStartOfFrame(byte marker) => marker is
        0xC0 or 0xC1 or 0xC2 or 0xC3 or 0xC5 or 0xC6 or 0xC7
        or 0xC9 or 0xCA or 0xCB or 0xCD or 0xCE or 0xCF;

    private readonly record struct ContentMetadata(string? ContentType, int? Width, int? Height);
}
