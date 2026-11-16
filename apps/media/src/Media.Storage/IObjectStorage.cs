namespace Media.Storage;

public interface IObjectStorage
{
    bool HasLocation(string locationId);
    Task<StoredFile?> OpenReadAsync(string locationId, string fileKey, CancellationToken cancellationToken);
    Task PublishAsync(string locationId, string fileKey, Stream content, CancellationToken cancellationToken);
    Task ProbeAsync(string locationId, CancellationToken cancellationToken);
}
