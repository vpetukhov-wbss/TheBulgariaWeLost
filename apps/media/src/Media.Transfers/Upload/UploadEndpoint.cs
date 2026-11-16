using Media.ControlPlane;
using Media.Storage;
using Media.Storage.Content;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

namespace Media.Transfers.Upload;

internal static class UploadEndpoint
{
    public static async Task<IResult> HandleAsync(
        Guid uploadId, HttpRequest request, MediaControlClient control, IObjectStorage storage,
        TransferSlots slots, IOptions<TransferOptions> options, CancellationToken requestAborted)
    {
        var grant = TransferGrant.Read(request, allowQuery: false);
        if (grant is null) return TransferProblems.Create(401, "missing_grant");
        var limits = options.Value;
        if (request.ContentLength > limits.MaxUploadBytes)
            return TransferProblems.Create(413, "upload_too_large");

        using var slot = await slots.TryAcquireAsync(requestAborted);
        if (slot is null) return TransferProblems.Create(429, "media_busy");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
        timeout.CancelAfter(TimeSpan.FromSeconds(limits.TimeoutSeconds));
        var cancellationToken = timeout.Token;
        try
        {
            var claim = await control.ClaimUploadAsync(uploadId, grant, cancellationToken);
            if (claim.AttemptId == Guid.Empty || claim.Object is null
                || !StorageModule.IsFileKey(claim.Object.FileKey) || !MediaContent.ValidSha256(claim.Sha256)
                || claim.Length <= 0)
                return TransferProblems.Create(503, "invalid_upload_claim");

            var location = claim.Object.StorageLocationId;
            var key = claim.Object.FileKey;
            if (string.IsNullOrEmpty(location) || !storage.HasLocation(location))
                return TransferProblems.Create(503, "storage_unavailable");
            if (claim.Length > limits.MaxUploadBytes)
                return TransferProblems.Create(413, "upload_too_large");

            var content = await InspectStoredAsync(storage, claim, cancellationToken);
            if (content is null)
            {
                if (request.ContentLength is long declaredLength && declaredLength != claim.Length)
                    return TransferProblems.Create(422, "upload_length_mismatch");

                var path = Path.Combine(limits.QuarantineDirectory, $"{Guid.NewGuid():N}.upload");
                await using var temporary = new FileStream(path, FileMode.CreateNew, FileAccess.ReadWrite,
                    FileShare.None, 64 * 1024, FileOptions.Asynchronous | FileOptions.DeleteOnClose);
                content = await MediaContent.InspectAsync(request.Body, claim.Length, temporary, cancellationToken);
                if (content is null) return TransferProblems.Create(413, "upload_too_large");
                if (content.ContentType is null) return TransferProblems.Create(415, "unsupported_media_format");
                if (!content.Matches(claim.Length, claim.Sha256))
                    return TransferProblems.Create(422, "upload_integrity_mismatch");

                temporary.Position = 0;
                await storage.PublishAsync(location, key, temporary, cancellationToken);
                content = await InspectStoredAsync(storage, claim, cancellationToken);
            }

            // Also covers retries after the bytes were committed and the acknowledgement was lost.
            if (content?.ContentType is null || !content.Matches(claim.Length, claim.Sha256))
                return TransferProblems.Create(409, "stored_object_integrity_mismatch");

            await control.CompleteUploadAsync(uploadId,
                new UploadReceipt(claim.AttemptId, content.Length, content.Sha256, content.ContentType), cancellationToken);
            return Results.NoContent();
        }
        catch (ControlPlaneException exception) { return TransferProblems.FromControlPlane(exception); }
        catch (BadHttpRequestException exception) when (exception.StatusCode == 413)
        {
            return TransferProblems.Create(413, "upload_too_large");
        }
        catch (Exception exception) when (exception is StorageFailure or IOException or UnauthorizedAccessException)
        {
            return TransferProblems.Create(503, "storage_unavailable");
        }
        catch (OperationCanceledException) when (!requestAborted.IsCancellationRequested)
        {
            return TransferProblems.Create(503, "transfer_timeout");
        }
    }

    private static async Task<MediaContent?> InspectStoredAsync(
        IObjectStorage storage, UploadClaim claim, CancellationToken cancellationToken)
    {
        await using var existing =
            await storage.OpenReadAsync(claim.Object.StorageLocationId, claim.Object.FileKey, cancellationToken);
        if (existing is null) return null;
        if (existing.Length != claim.Length) return new MediaContent(existing.Length, "", null);
        return await MediaContent.InspectAsync(existing.Content, claim.Length, null, cancellationToken)
            ?? new MediaContent(existing.Length, "", null);
    }
}
