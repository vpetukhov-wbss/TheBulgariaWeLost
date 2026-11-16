using Media.Api.Storage;
using Media.ControlPlane;
using Media.Processing;
using Media.Storage;
using Media.Transfers;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory
});
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.AddOpenApi();
builder.Services.AddMediaControlPlane(builder.Configuration, requireHttps: !builder.Environment.IsDevelopment());
builder.Services.AddMediaStorage(builder.Configuration);
builder.Services.AddMediaTransfers(builder.Configuration);
builder.Services.AddMediaProcessing(builder.Configuration);
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = builder.Configuration.GetValue<long?>("MediaTransfers:MaxUploadBytes")
        ?? new TransferOptions().MaxUploadBytes;
});

var app = builder.Build();
var transfers = app.Services.GetRequiredService<IOptions<TransferOptions>>().Value;
Directory.CreateDirectory(transfers.QuarantineDirectory);

app.UseExceptionHandler();
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    await next(context);
});

if (app.Environment.IsDevelopment()) app.MapOpenApi("/media/openapi/{documentName}.json");

app.MapHealthChecks("/media/health/live");
app.MapMediaTransfers();
app.MapPost("/internal/media/v1/storage/{locationId}/probe", StorageProbeEndpoint.HandleAsync);
app.Run();

public partial class Program;
