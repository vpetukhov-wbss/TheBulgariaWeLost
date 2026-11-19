namespace Media.Transfers;

public sealed class TransferOptions
{
    public long MaxUploadBytes { get; set; } = 32 * 1024 * 1024;
    public int ConcurrentTransfers { get; set; } = 8;
    public int TimeoutSeconds { get; set; } = 120;
    public string QuarantineDirectory { get; set; } = ".quarantine";
    public int QuarantineRetentionMinutes { get; set; } = 60;
    public int QuarantineCleanupIntervalSeconds { get; set; } = 300;
}
