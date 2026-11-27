namespace Media.Storage;

public sealed class StorageFailure : Exception
{
    public StorageFailure(bool accessDenied = false) : base("Media storage operation failed.")
    {
        AccessDenied = accessDenied;
    }

    public bool AccessDenied { get; }
}
