using Media.Api.Storage;
using Media.ControlPlane;
using Media.Processing;
using Media.Storage;
using Media.Transfers;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory
});
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = context =>
    {
        var details = context.ProblemDetails;
        details.Type = details.Extensions.TryGetValue("code", out var code) && code is string value
            ? $"https://thebulgariawelost.org/problems/{value}"
            : "https://thebulgariawelost.org/problems/http-error";
        details.Instance ??= context.HttpContext.Request.Path.Value;
        details.Extensions.TryAdd("code", $"http_{details.Status ?? 500}");
        details.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
    };
});
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

app.Use(async (context, next) =>
{
    const string header = "X-Correlation-ID";
    var supplied = context.Request.Headers[header].FirstOrDefault();
    var correlationId = supplied is { Length: > 0 and <= 128 } && supplied.All(character =>
        char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or ':' or '-')
        ? supplied
        : Guid.NewGuid().ToString();
    context.TraceIdentifier = correlationId;
    context.Response.OnStarting(() =>
    {
        context.Response.Headers[header] = correlationId;
        return Task.CompletedTask;
    });
    await next();
});
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
app.MapGet("/internal/media/v1/storage/profiles", StorageProbeEndpoint.ListProfiles);
app.MapPost("/internal/media/v1/storage/{locationId}/probe", StorageProbeEndpoint.HandleAsync);
app.Run();

public partial class Program;
