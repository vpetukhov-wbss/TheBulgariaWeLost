namespace Media.ControlPlane;

public sealed record ObjectReference(string StorageLocationId, string FileKey);

public sealed record UploadClaim(
    Guid AttemptId,
    int AttemptVersion,
    ObjectReference Object,
    long Length,
    string Sha256);

public sealed record UploadReceipt(Guid AttemptId, long Length, string Sha256, string ContentType);

public sealed record ReadDecision(ObjectReference Object, long Length, string ContentType);

public sealed record InspectionLease(
    Guid JobId,
    Guid AttemptId,
    ObjectReference Object,
    ObjectReference PreviewObject,
    long Length,
    string Sha256);

public sealed record InspectionResult(
    Guid AttemptId,
    string Outcome,
    long? Length = null,
    string? Sha256 = null,
    string? ContentType = null,
    ObjectReference? PreviewObject = null,
    long? PreviewLength = null,
    string? PreviewSha256 = null,
    string? PreviewContentType = null);
