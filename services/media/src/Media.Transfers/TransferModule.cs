using Media.Transfers.Read;
using Media.Transfers.Upload;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Media.Transfers;

public static class TransferModule
{
    public static IServiceCollection AddMediaTransfers(this IServiceCollection services, IConfiguration config)
    {
        services.AddOptions<TransferOptions>().Bind(config.GetSection("MediaTransfers"))
            .Validate(options => options.MaxUploadBytes is >= 8 and <= 1024L * 1024 * 1024
                && options.ConcurrentTransfers is >= 1 and <= 64
                && options.TimeoutSeconds is >= 10 and <= 600
                && !string.IsNullOrWhiteSpace(options.QuarantineDirectory),
                "Configure positive transfer limits and a quarantine directory.")
            .ValidateOnStart();
        return services.AddSingleton<TransferSlots>();
    }

    public static void MapMediaTransfers(this IEndpointRouteBuilder routes)
    {
        var media = routes.MapGroup("/media/v1");
        media.MapPut("/uploads/{uploadId:guid}", UploadEndpoint.HandleAsync)
            .WithName("UploadMedia")
            .WithSummary("Upload raw file bytes using a short-lived bearer grant.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity);
        media.MapMethods("/assets/{assetId:guid}/{variant}", ["GET", "HEAD"], ReadEndpoint.HandleAsync)
            .WithSummary("Read the authorized file variant, with optional HTTP Range.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status206PartialContent)
            .ProducesProblem(StatusCodes.Status403Forbidden);
    }
}
