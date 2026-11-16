using System.Net;
using Media.ControlPlane;
using Media.Storage;
using Media.Storage.Content;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Media.Processing.Inspection;

internal sealed class InspectionWorker(
    IServiceScopeFactory scopes, ILogger<InspectionWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(3));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await ProcessNextAsync(stoppingToken);
            }
            catch (ControlPlaneException exception) when (exception.Status == HttpStatusCode.Conflict)
            {
                logger.LogInformation("NestJS no longer accepts the media inspection attempt.");
            }
            catch (Exception exception) when (exception is ControlPlaneException or StorageFailure
                or IOException || exception is OperationCanceledException && !stoppingToken.IsCancellationRequested)
            {
                // An unacknowledged lease becomes available again in NestJS.
                logger.LogWarning("Media inspection is temporarily unavailable. An active lease can expire.");
            }
        }
    }

    private async Task ProcessNextAsync(CancellationToken stoppingToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(60));
        var cancellationToken = timeout.Token;
        var control = scope.ServiceProvider.GetRequiredService<MediaControlClient>();
        var lease = await control.LeaseInspectionAsync(cancellationToken);
        if (lease is null) return;

        if (lease.JobId == Guid.Empty || lease.AttemptId == Guid.Empty || lease.Object is null
            || !StorageModule.IsFileKey(lease.Object.FileKey) || !MediaContent.ValidSha256(lease.Sha256)
            || lease.Length is <= 0 or > 1024L * 1024 * 1024)
            throw new ControlPlaneException(HttpStatusCode.ServiceUnavailable);

        var storage = scope.ServiceProvider.GetRequiredService<IObjectStorage>();
        var location = lease.Object.StorageLocationId;
        if (string.IsNullOrEmpty(location) || !storage.HasLocation(location))
            throw new StorageFailure();

        var result = await InspectAsync(lease, storage, cancellationToken);
        await control.CompleteInspectionAsync(lease.JobId, result, cancellationToken);
    }

    private static async Task<InspectionResult> InspectAsync(
        InspectionLease lease, IObjectStorage storage, CancellationToken cancellationToken)
    {
        await using var item = await storage.OpenReadAsync(
            lease.Object.StorageLocationId, lease.Object.FileKey, cancellationToken);
        if (item is null) return new InspectionResult(lease.AttemptId, "missing");
        if (item.Length != lease.Length) return new InspectionResult(lease.AttemptId, "integrity_mismatch");

        var content = await MediaContent.InspectAsync(item.Content, lease.Length, null, cancellationToken);
        if (content is null || !content.Matches(lease.Length, lease.Sha256))
            return new InspectionResult(lease.AttemptId, "integrity_mismatch");
        if (content.ContentType is null)
            return new InspectionResult(lease.AttemptId, "unsupported_format");
        return new InspectionResult(lease.AttemptId, "inspected", content.Length, content.Sha256, content.ContentType);
    }
}
