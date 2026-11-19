using Media.Storage.Sftp;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Media.Storage;

public static class StorageModule
{
    public static IServiceCollection AddMediaStorage(this IServiceCollection services, IConfiguration config)
    {
        services.AddOptions<SftpOptions>()
            .Bind(config.GetSection("MediaStorage"))
            .Validate(options => options.PartialRetentionMinutes is >= 1 and <= 10_080
                && options.CleanupIntervalSeconds is >= 10 and <= 3_600
                && options.Profiles.Values.All(profile =>
                !string.IsNullOrWhiteSpace(profile.Host)
                && profile.Port is >= 1 and <= 65535
                && !string.IsNullOrWhiteSpace(profile.Username)
                && !string.IsNullOrWhiteSpace(profile.PrivateKeyPath)
                && profile.HostKeySha256.StartsWith("SHA256:", StringComparison.Ordinal)
                && profile.HostKeySha256.Length == 50
                && profile.Root.StartsWith('/')
                && !profile.Root.Contains('\\')
                && !profile.Root.Split('/').Any(segment => segment is ".." or ".")
                && profile.Root.Trim('/').Length > 0),
                "Each SFTP profile requires a host, username, private key, SHA256 host fingerprint and absolute directory.")
            .ValidateOnStart();

        services.AddSingleton<IObjectStorage, SftpObjectStorage>();
        services.AddHostedService<SftpPartialCleanupWorker>();
        return services;
    }

    public static bool IsFileKey(string? key) => key is { Length: 64 } &&
        key.All(ch => ch is >= 'a' and <= 'f' or >= '0' and <= '9');
}
