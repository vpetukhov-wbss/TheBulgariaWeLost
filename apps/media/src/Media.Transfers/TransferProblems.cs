using System.Net;
using Media.ControlPlane;
using Microsoft.AspNetCore.Http;

namespace Media.Transfers;

internal static class TransferProblems
{
    public static IResult Create(int status, string code) =>
        Results.Problem(statusCode: status, extensions: new Dictionary<string, object?> { ["code"] = code });

    public static IResult FromControlPlane(ControlPlaneException exception) => exception.Status switch
    {
        HttpStatusCode.Unauthorized => Create(401, "invalid_grant"),
        HttpStatusCode.Forbidden => Create(403, "media_access_denied"),
        HttpStatusCode.NotFound => Create(404, "media_not_found"),
        HttpStatusCode.Conflict => Create(409, "media_conflict"),
        HttpStatusCode.TooManyRequests => Create(429, "media_busy"),
        _ => Create(503, "media_control_unavailable")
    };
}
