using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Media.Transfers.Upload;

internal sealed class QuarantineCleanupWorker(
    UploadQuarantine quarantine,
    IOptions<TransferOptions> options,
    ILogger<QuarantineCleanupWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        Cleanup();
        using var timer = new PeriodicTimer(
            TimeSpan.FromSeconds(options.Value.QuarantineCleanupIntervalSeconds));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
                Cleanup();
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal host shutdown.
        }
    }

    private void Cleanup()
    {
        var cutoff = DateTime.UtcNow.AddMinutes(-options.Value.QuarantineRetentionMinutes);
        var deleted = quarantine.CleanupExpired(cutoff);
        if (deleted > 0)
            logger.LogInformation("Removed {Count} expired private quarantine files.", deleted);
    }
}
