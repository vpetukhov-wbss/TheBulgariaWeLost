using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Media.Storage;

namespace Media.Api.Storage;

internal static class StorageProbeEndpoint
{
    public static IResult ListProfiles(HttpRequest request, IObjectStorage storage, IConfiguration config) =>
        IsAuthorized(request, config)
            ? Results.Ok(storage.LocationIds)
            : Results.Unauthorized();

    public static async Task<IResult> HandleAsync(
        string locationId, HttpRequest request, IObjectStorage storage, IConfiguration config,
        CancellationToken requestAborted)
    {
        if (!IsAuthorized(request, config)) return Results.Unauthorized();
        if (!storage.HasLocation(locationId)) return Results.NotFound();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        try
        {
            await storage.ProbeAsync(locationId, timeout.Token);
            return Results.NoContent();
        }
        catch (StorageFailure failure)
        {
            return failure.AccessDenied
                ? Results.Problem(statusCode: 403,
                    extensions: new Dictionary<string, object?> { ["code"] = "storage_access_denied" })
                : Unavailable();
        }
        catch (OperationCanceledException) when (!requestAborted.IsCancellationRequested)
        {
            return Unavailable();
        }
    }

    private static bool IsAuthorized(HttpRequest request, IConfiguration config)
    {
        var secret = config["MediaControl:ProbeToken"];
        var authorization = request.Headers.Authorization;
        return secret is { Length: >= 32 }
            && !string.Equals(secret, config["MediaControl:ServiceToken"], StringComparison.Ordinal)
            && authorization.Count == 1
            && AuthenticationHeaderValue.TryParse(authorization[0], out var header)
            && header.Scheme.Equals("Bearer", StringComparison.OrdinalIgnoreCase)
            && header.Parameter is { Length: <= 4096 } provided
            && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(provided), Encoding.UTF8.GetBytes(secret));
    }

    private static IResult Unavailable() => Results.Problem(statusCode: 503,
        extensions: new Dictionary<string, object?> { ["code"] = "storage_unavailable" });
}
