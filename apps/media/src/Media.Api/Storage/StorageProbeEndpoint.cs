using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Media.Storage;

namespace Media.Api.Storage;

internal static class StorageProbeEndpoint
{
    public static async Task<IResult> HandleAsync(
        string locationId, HttpRequest request, IObjectStorage storage, IConfiguration config,
        CancellationToken requestAborted)
    {
        var secret = config["MediaControl:ProbeToken"];
        var authorization = request.Headers.Authorization;
        if (secret is not { Length: >= 32 } || string.Equals(secret, config["MediaControl:ServiceToken"], StringComparison.Ordinal)
            || authorization.Count != 1 || !AuthenticationHeaderValue.TryParse(authorization[0], out var header)
            || !header.Scheme.Equals("Bearer", StringComparison.OrdinalIgnoreCase)
            || header.Parameter is not { Length: <= 4096 } provided
            || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(provided), Encoding.UTF8.GetBytes(secret)))
            return Results.Unauthorized();

        if (!storage.HasLocation(locationId)) return Results.NotFound();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        try
        {
            await storage.ProbeAsync(locationId, timeout.Token);
            return Results.NoContent();
        }
        catch (StorageFailure)
        {
            return Unavailable();
        }
        catch (OperationCanceledException) when (!requestAborted.IsCancellationRequested)
        {
            return Unavailable();
        }
    }

    private static IResult Unavailable() => Results.Problem(statusCode: 503,
        extensions: new Dictionary<string, object?> { ["code"] = "storage_unavailable" });
}
