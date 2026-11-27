using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Media.ControlPlane;

public sealed class MediaControlClient(HttpClient http)
{
    private const string Prefix = "internal/media/v1";

    public async Task<UploadClaim> ClaimUploadAsync(Guid id, string grant, CancellationToken cancellationToken)
    {
        using var response = await PostAsync($"{Prefix}/uploads/{id:D}/claim", new { grant }, cancellationToken);
        return await ReadAsync<UploadClaim>(response, cancellationToken);
    }

    public async Task CompleteUploadAsync(Guid id, UploadReceipt receipt, CancellationToken cancellationToken)
    {
        using var response = await PostAsync($"{Prefix}/uploads/{id:D}/complete", receipt, cancellationToken);
    }

    public async Task<ReadDecision> AuthorizeReadAsync(
        Guid id, string variant, string grant, CancellationToken cancellationToken)
    {
        using var response = await PostAsync(
            $"{Prefix}/assets/{id:D}/authorize-read", new { variant, grant }, cancellationToken);
        return await ReadAsync<ReadDecision>(response, cancellationToken);
    }

    public async Task<InspectionLease?> LeaseInspectionAsync(Guid workerId, CancellationToken cancellationToken)
    {
        using var response = await PostAsync($"{Prefix}/inspections/lease", new { workerId }, cancellationToken);
        return response.StatusCode == HttpStatusCode.NoContent
            ? null
            : await ReadAsync<InspectionLease>(response, cancellationToken);
    }

    public async Task CompleteInspectionAsync(
        Guid id, InspectionResult result, CancellationToken cancellationToken, string? traceId = null)
    {
        using var response = await PostAsync($"{Prefix}/inspections/{id:D}/complete", result, cancellationToken, traceId);
    }

    private async Task<HttpResponseMessage> PostAsync<T>(
        string path, T body, CancellationToken cancellationToken, string? traceId = null)
    {
        // Leave the byte transfers separate from the bounded JSON control requests.
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, path)
            {
                Content = JsonContent.Create(body)
            };
            if (traceId is { Length: > 0 and <= 128 } &&
                traceId.All(character => char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or ':' or '-'))
                request.Headers.Add("X-Correlation-ID", traceId);

            var response = await http.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode) return response;

            var status = response.StatusCode;
            response.Dispose();
            throw new ControlPlaneException(status);
        }
        catch (HttpRequestException)
        {
            throw new ControlPlaneException(HttpStatusCode.ServiceUnavailable);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new ControlPlaneException(HttpStatusCode.ServiceUnavailable);
        }
    }

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            return await response.Content.ReadFromJsonAsync<T>(cancellationToken)
                ?? throw new ControlPlaneException(HttpStatusCode.ServiceUnavailable);
        }
        catch (JsonException)
        {
            throw new ControlPlaneException(HttpStatusCode.ServiceUnavailable);
        }
    }
}
