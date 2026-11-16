namespace Media.Storage;

public sealed record StoredFile(Stream Content, long Length) : IAsyncDisposable
{
    public ValueTask DisposeAsync() => Content.DisposeAsync();
}
