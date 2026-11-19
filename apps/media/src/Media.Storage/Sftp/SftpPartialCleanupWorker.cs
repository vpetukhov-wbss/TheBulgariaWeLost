using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Media.Storage.Sftp;

internal sealed class SftpPartialCleanupWorker(
    IObjectStorage storage,
    IOptions<SftpOptions> options,
    ILogger<SftpPartialCleanupWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await CleanupAsync(stoppingToken);
            using var timer = new PeriodicTimer(
                TimeSpan.FromSeconds(options.Value.CleanupIntervalSeconds));
            while (await timer.WaitForNextTickAsync(stoppingToken))
                await CleanupAsync(stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal host shutdown.
        }
    }

    private async Task CleanupAsync(CancellationToken cancellationToken)
    {
        try
        {
            var cutoff = DateTime.UtcNow.AddMinutes(-options.Value.PartialRetentionMinutes);
            await storage.CleanupExpiredPartialsAsync(cutoff, cancellationToken);
        }
        catch (StorageFailure)
        {
            logger.LogWarning("Expired SFTP partial cleanup is temporarily unavailable.");
        }
    }
}
