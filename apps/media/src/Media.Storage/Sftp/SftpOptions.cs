namespace Media.Storage.Sftp;

internal sealed class SftpOptions
{
    public int PartialRetentionMinutes { get; set; } = 60;
    public int CleanupIntervalSeconds { get; set; } = 300;
    public Dictionary<string, SftpProfile> Profiles { get; set; } = new(StringComparer.Ordinal);
}

internal sealed class SftpProfile
{
    public string Host { get; set; } = "";
    public int Port { get; set; } = 22;
    public string Username { get; set; } = "";
    public string PrivateKeyPath { get; set; } = "";
    public string? PrivateKeyPassphrase { get; set; }
    public string HostKeySha256 { get; set; } = "";
    public string Root { get; set; } = "";
}
