using Media.ControlPlane;
using Media.Storage;
using Media.Storage.Content;

namespace Media.Processing.Inspection;

internal static class InspectionProcessor
{
    public static async Task<InspectionResult> ProcessAsync(
        InspectionLease lease, IObjectStorage storage, CancellationToken cancellationToken)
    {
        await using var item = await storage.OpenReadAsync(
            lease.Object.StorageLocationId, lease.Object.FileKey, cancellationToken);
        if (item is null) return Failed(lease, "missing");
        if (item.Length != lease.Length) return Failed(lease, "integrity_mismatch");

        var content = await MediaContent.InspectAsync(item.Content, lease.Length, null, cancellationToken);
        if (content is null || !content.Matches(lease.Length, lease.Sha256))
            return Failed(lease, "integrity_mismatch");
        if (content.ContentType is null)
            return Failed(lease, "unsupported_format");

        await using (var original = await storage.OpenReadAsync(
                         lease.Object.StorageLocationId, lease.Object.FileKey, cancellationToken))
        {
            if (original is null || original.Length != content.Length)
                return Failed(lease, "integrity_mismatch");
            await storage.PublishAsync(
                lease.PreviewObject.StorageLocationId,
                lease.PreviewObject.FileKey,
                original.Content,
                cancellationToken);
        }

        await using var preview = await storage.OpenReadAsync(
            lease.PreviewObject.StorageLocationId, lease.PreviewObject.FileKey, cancellationToken);
        if (preview is null || preview.Length != content.Length)
            return Failed(lease, "integrity_mismatch");
        var previewContent = await MediaContent.InspectAsync(
            preview.Content, content.Length, null, cancellationToken);
        if (previewContent?.ContentType is null ||
            !previewContent.Matches(content.Length, content.Sha256))
            return Failed(lease, "integrity_mismatch");

        return new InspectionResult(
            lease.AttemptId,
            "inspected",
            content.Length,
            content.Sha256,
            content.ContentType,
            lease.PreviewObject,
            previewContent.Length,
            previewContent.Sha256,
            previewContent.ContentType);
    }

    private static InspectionResult Failed(InspectionLease lease, string outcome) =>
        new(lease.AttemptId, outcome);
}
