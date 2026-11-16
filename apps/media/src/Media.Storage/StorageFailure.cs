namespace Media.Storage;

public sealed class StorageFailure : Exception
{
    public StorageFailure() : base("Media storage operation failed.") { }
}
