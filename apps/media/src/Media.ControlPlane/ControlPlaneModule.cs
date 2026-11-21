using System.Net.Http.Headers;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Media.ControlPlane;

public static class ControlPlaneModule
{
    public static IServiceCollection AddMediaControlPlane(
        this IServiceCollection services, IConfiguration config, bool requireHttps)
    {
        services.AddOptions<MediaControlOptions>()
            .Bind(config.GetSection("MediaControl"))
            .Validate(options => options.BaseUrl is { IsAbsoluteUri: true } url
                && (url.Scheme == "https" || (!requireHttps && url.Scheme == "http"
                    && (url.IsLoopback || url.Host.Equals("api", StringComparison.OrdinalIgnoreCase))))
                && url.AbsolutePath == "/" && url.Query.Length == 0 && url.Fragment.Length == 0
                && url.UserInfo.Length == 0, "Configure the NestJS origin in MediaControl:BaseUrl.")
            .Validate(options => options.ServiceToken.Length >= 32
                && options.ServiceToken.All(ch => char.IsAsciiLetterOrDigit(ch) || ch is '-' or '_'),
                "Configure a distinct service token in MediaControl:ServiceToken.")
            .ValidateOnStart();

        services.AddHttpContextAccessor();
        services.AddTransient<CorrelationIdForwardingHandler>();

        services.AddHttpClient<MediaControlClient>((provider, client) =>
        {
            var options = provider.GetRequiredService<IOptions<MediaControlOptions>>().Value;
            client.BaseAddress = options.BaseUrl;
            client.Timeout = TimeSpan.FromSeconds(8);
            client.MaxResponseContentBufferSize = 64 * 1024;
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", options.ServiceToken);
        }).AddHttpMessageHandler<CorrelationIdForwardingHandler>()
            .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });

        return services;
    }
}
