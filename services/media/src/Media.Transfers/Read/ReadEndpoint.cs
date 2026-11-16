using Media.ControlPlane;
using Media.Storage;
using Media.Storage.Content;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

namespace Media.Transfers.Read;

internal static class ReadEndpoint
{
    public static async Task HandleAsync(
        Guid assetId, string variant, HttpContext context, MediaControlClient control, IObjectStorage storage,
        TransferSlots slots, IOptions<TransferOptions> options, CancellationToken requestAborted)
    {
        var result = await ReadAsync(assetId, variant, context, control, storage, slots, options.Value, requestAborted);
        if (result is not null) await result.ExecuteAsync(context);
    }

    private static async Task<IResult?> ReadAsync(
        Guid assetId, string variant, HttpContext context, MediaControlClient control, IObjectStorage storage,
        TransferSlots slots, TransferOptions limits, CancellationToken requestAborted)
    {
        if (variant is not ("original" or "preview")) return TransferProblems.Create(404, "media_not_found");
        var grant = TransferGrant.Read(context.Request, allowQuery: true);
        if (grant is null) return TransferProblems.Create(401, "missing_grant");

        using var slot = await slots.TryAcquireAsync(requestAborted);
        if (slot is null) return TransferProblems.Create(429, "media_busy");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
        timeout.CancelAfter(TimeSpan.FromSeconds(limits.TimeoutSeconds));
        var cancellationToken = timeout.Token;
        try
        {
            var decision = await control.AuthorizeReadAsync(assetId, variant, grant, cancellationToken);
            if (decision.Object is null || !StorageModule.IsFileKey(decision.Object.FileKey)
                || decision.Length <= 0 || !MediaContent.SupportedType(decision.ContentType))
                return TransferProblems.Create(503, "invalid_read_decision");

            var location = decision.Object.StorageLocationId;
            if (string.IsNullOrEmpty(location) || !storage.HasLocation(location))
                return TransferProblems.Create(503, "storage_unavailable");

            await using var item = await storage.OpenReadAsync(location, decision.Object.FileKey, cancellationToken);
            if (item is null) return TransferProblems.Create(404, "media_not_found");
            if (item.Length != decision.Length)
                return TransferProblems.Create(503, "stored_object_integrity_mismatch");

            var downloadName = (variant, decision.ContentType) switch
            {
                (_, "application/pdf") => "archive.pdf",
                ("original", "image/png") => "archive.png",
                ("original", _) => "archive.jpg",
                _ => null
            };
            var previous = context.RequestAborted;
            context.RequestAborted = cancellationToken;
            try
            {
                await Results.Stream(item.Content, decision.ContentType, downloadName, enableRangeProcessing: true)
                    .ExecuteAsync(context);
            }
            finally
            {
                context.RequestAborted = previous;
            }
            return null;
        }
        catch (ControlPlaneException exception) { return TransferProblems.FromControlPlane(exception); }
        catch (Exception exception) when (!context.Response.HasStarted && exception is StorageFailure or IOException)
        {
            return TransferProblems.Create(503, "storage_unavailable");
        }
        catch (OperationCanceledException) when (!requestAborted.IsCancellationRequested && !context.Response.HasStarted)
        {
            return TransferProblems.Create(503, "transfer_timeout");
        }
    }
}
