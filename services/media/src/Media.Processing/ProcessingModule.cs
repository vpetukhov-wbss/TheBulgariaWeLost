using Media.Processing.Inspection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Media.Processing;

public static class ProcessingModule
{
    public static IServiceCollection AddMediaProcessing(this IServiceCollection services, IConfiguration config)
    {
        if (config.GetValue<bool>("MediaProcessing:Enabled"))
            services.AddHostedService<InspectionWorker>();
        return services;
    }
}
