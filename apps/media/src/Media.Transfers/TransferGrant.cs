using System.Net.Http.Headers;
using Microsoft.AspNetCore.Http;

namespace Media.Transfers;

internal static class TransferGrant
{
    public static string? Read(HttpRequest request, bool allowQuery)
    {
        var authorization = request.Headers.Authorization;
        var query = allowQuery ? request.Query["grant"] : default;
        var value = authorization.Count switch
        {
            0 when query.Count == 1 => query[0],
            1 when query.Count == 0
                && AuthenticationHeaderValue.TryParse(authorization[0], out var bearer)
                && bearer.Scheme.Equals("Bearer", StringComparison.OrdinalIgnoreCase) => bearer.Parameter,
            _ => null
        };
        return value is { Length: > 0 and <= 2048 } &&
            value.All(ch => char.IsAsciiLetterOrDigit(ch) || ch is '-' or '_' or '.') ? value : null;
    }
}
