using Microsoft.AspNetCore.Http;

namespace Media.ControlPlane;

internal sealed class CorrelationIdForwardingHandler(IHttpContextAccessor contextAccessor)
    : DelegatingHandler
{
    private const string Header = "X-Correlation-ID";

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var correlationId = contextAccessor.HttpContext?.TraceIdentifier;
        if (IsSafe(correlationId) && !request.Headers.Contains(Header))
            request.Headers.TryAddWithoutValidation(Header, correlationId);

        return base.SendAsync(request, cancellationToken);
    }

    private static bool IsSafe(string? value) =>
        value is { Length: > 0 and <= 128 }
        && value.All(character => char.IsAsciiLetterOrDigit(character)
            || character is '.' or '_' or ':' or '-');
}
