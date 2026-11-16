using Renci.SshNet;
using Renci.SshNet.Common;

namespace Media.Storage.Sftp;

internal sealed class SftpReadStream(SftpClient client, PrivateKeyFile key, Stream stream, long length) : Stream
{
    private bool disposed;

    public override bool CanRead => !disposed;
    public override bool CanSeek => !disposed;
    public override bool CanWrite => false;
    public override long Length => length;
    public override long Position { get => stream.Position; set => stream.Position = value; }

    public override long Seek(long offset, SeekOrigin origin) => stream.Seek(origin switch
    {
        SeekOrigin.Begin => offset,
        SeekOrigin.Current => Position + offset,
        SeekOrigin.End => length + offset,
        _ => throw new ArgumentOutOfRangeException(nameof(origin))
    }, SeekOrigin.Begin);

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        try { return await stream.ReadAsync(buffer, cancellationToken); }
        catch (Exception error) when (error is SshException or IOException) { throw new StorageFailure(); }
    }

    public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
        ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

    public override int Read(byte[] buffer, int offset, int count) =>
        throw new NotSupportedException("Use asynchronous reads for SFTP.");

    public override void Flush() => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    protected override void Dispose(bool disposing)
    {
        if (!disposing || disposed) return;
        disposed = true;
        try { stream.Dispose(); }
        finally
        {
            client.Dispose();
            key.Dispose();
            base.Dispose(disposing);
        }
    }

    public override async ValueTask DisposeAsync()
    {
        if (disposed) return;
        disposed = true;
        try { await stream.DisposeAsync(); }
        finally
        {
            client.Dispose();
            key.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
