# Async/await, concurrency and cancellation — production .NET playbook

**Review date:** 2026-10-30. **Audience:** ASP.NET Core, worker services, Blazor, .NET MAUI and general-purpose C# libraries. This is an original, applied synthesis, not a reproduction of a social post.

## Attribution and verification
The user highlighted Aram Tchekrekjian's recent LinkedIn post titled "7 Async/Await Mistakes Even Senior .NET Developers Make". Its complete text could not be independently retrieved at review time. A separate, publicly accessible Aram post named "12 Async/Await Mistakes in C#" was inspected, and the practices below were checked against Microsoft Learn and Stephen Toub's ConfigureAwait FAQ. Do not attribute these exact examples or prioritization to the unretrieved seven-point post.

- Aram's *12 Async/Await Mistakes in C#*: https://www.linkedin.com/posts/aramt87_%F0%9D%9F%AD%F0%9D%9F%AE-%F0%9D%97%94%F0%9D%98%80%F0%9D%98%86%F0%9D%97%BB%F0%9D%97%B0%F0%9D%97%94%F0%9D%98%84%F0%9D%97%AE%F0%9D%97%B6%F0%9D%98%81-%F0%9D%97%A0%F0%9D%97%B6%F0%9D%98%80%F0%9D%98%81%F0%9D%97%AE%F0%9D%97%B8%F0%9D%97%B2-activity-7496456880777715713-wfom
- ASP.NET Core performance: https://learn.microsoft.com/aspnet/core/performance/performance-best-practices
- C# asynchronous programming: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/
- Async scenarios, `async void`, I/O vs CPU: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-scenarios
- Background hosted services: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services
- `ConfigureAwait` FAQ (Stephen Toub): https://devblogs.microsoft.com/dotnet/configureawait-faq/

## Correctness rules

1. **Avoid sync-over-async on request/UI paths.** Do not call `.Result`, `.Wait()`, `GetAwaiter().GetResult()`, `Task.WaitAll` on incomplete asynchronous work. Continue with `await` through relevant layers. In modern ASP.NET Core the common consequence is thread-pool starvation and reduced throughput; a deadlock is possible in some contexts, not guaranteed in every web request.
2. **Return awaitable work.** Prefer `Task`/`Task<T>` for work needing completion/exception observation. `async void` is reserved for event-handler signatures that demand it; catch exceptions at that boundary.
3. **Use real async I/O.** Await HTTP, EF Core, streams and sockets. `Task.Run` around already-asynchronous I/O adds scheduling overhead. For CPU-heavy work, `Task.Run` may help responsiveness in UI apps; ASP.NET Core normally needs bounded background processing or a separate worker instead.
4. **Compose independent work intentionally.** `Task.WhenAll` is appropriate for a *bounded* set of independent tasks. It does not magically create threads and it does not limit fan-out. Do **not** run concurrent operations against the same EF Core `DbContext` instance. If tasks depend on preceding results, keep sequential awaits.
5. **Bound load and add backpressure.** Use `Parallel.ForEachAsync` with explicit `MaxDegreeOfParallelism`, `SemaphoreSlim`, `Channel<T>` or a worker queue appropriate to the workload. Coordinate API/database rate limits, connection pool sizes and upstream concurrency.
6. **Propagate cancellation correctly.** Thread a caller-provided `CancellationToken` through every cancellable async I/O boundary; use linked cancellation/timeout policies for outbound calls. Treat cancellation as cancellation, not an ordinary transient failure; never cancel a partially committed irreversible side effect without an explicit consistency plan.
7. **Observe every Task's completion/errors.** Do not silently drop a Task (compiler warning CS4014). Observe `Task.WhenAll` and correctly classify timeout, failure and cancellation. The returned `WhenAll` task may hold multiple failures: avoid assuming the single exception thrown by `await` is the full fault set.
8. **Avoid unowned fire-and-forget work.** Request-scoped services can be disposed as the HTTP request ends. Use hosted services/queues, own the lifetime, create DI scopes per job, log failures and define shutdown/upgrade/idempotency behavior.
9. **Use await-safe synchronization.** Do not block on Tasks while holding `lock`/monitor; C# disallows `await` inside `lock`. Use `SemaphoreSlim.WaitAsync` and release in `finally` where truly needed, or avoid shared mutable state.
10. **Choose scheduling durability deliberately.** `Task.Delay` and `PeriodicTimer` are valid for lightweight cancellable in-process waits/polling. For restart-safe or business-critical scheduled jobs, use durable storage/leases and a scheduler or persisted queue; a bare forever-loop does not guarantee execution across restarts.
11. **Do not add fake async.** A synchronously computed value can remain synchronous; don't use `Task.Run`/`Task.Delay`/`async` solely to label a method asynchronous. Returning `Task.FromResult` when implementing an established async interface is legitimate.
12. **Context-aware awaits.** In app-level ASP.NET Core, MAUI and Blazor, normal `await` is the default; `ConfigureAwait(false)` is not a universal requirement. In reusable, app-model-agnostic libraries, it is usually appropriate. MAUI UI changes require UI-thread dispatch; Blazor component state changes require its renderer context. `ConfigureAwait(false)` does not change `ExecutionContext`/AsyncLocal propagation.
13. **Dispose async resources.** Prefer `await using` for `IAsyncDisposable` resources; understand lifetime of streamed `IAsyncEnumerable<T>`, DB connections and HTTP response streams.
14. **Measure before micro-optimizing.** Prefer `Task` by default; `ValueTask` can reduce allocation in hot paths but introduces single-consumption/composition pitfalls. Document a benchmark first.

## Examples (illustrative, adapt to the project)

### Independent, bounded HTTP I/O

```csharp
public async Task ProcessAsync(
    IReadOnlyList<Guid> ids,
    CancellationToken cancellationToken)
{
    await Parallel.ForEachAsync(
        ids,
        new ParallelOptions
        {
            MaxDegreeOfParallelism = 8, // example only; tune from limits and measurement
            CancellationToken = cancellationToken
        },
        async (id, ct) =>
        {
            await client.ProcessAsync(id, ct);
        });
}
```

Do not share a scoped EF Core `DbContext` across these callbacks. Start a new scope/context per operation if truly necessary, or use a different batching/data-access design.

### Await-safe throttling for an existing collection

```csharp
using var gate = new SemaphoreSlim(4); // illustrative, not a universal constant

async Task<T> ExecuteAsync<T>(Func<CancellationToken, Task<T>> action, CancellationToken ct)
{
    await gate.WaitAsync(ct);
    try
    {
        return await action(ct);
    }
    finally
    {
        gate.Release();
    }
}
```

The helper only demonstrates resource release; create concurrency scopes intentionally, not a new semaphore per item (that would provide no global limit).

### Cancellable, owned background loop

```csharp
public sealed class RefreshWorker(
    IServiceScopeFactory scopes,
    ILogger<RefreshWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await using var scope = scopes.CreateAsyncScope();
                var service = scope.ServiceProvider.GetRequiredService<IRefreshService>();
                try
                {
                    await service.RefreshAsync(stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Refresh failed");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Expected cooperative shutdown.
        }
    }
}
```

This is an *in-process* timer, **not** a guarantee of once-only execution, missed tick recovery, leases or durable scheduling.

## PR review checklist
- Any synchronously blocked async call on HTTP/UI/worker hot paths?
- Any unawaited Task, `async void` outside event handlers, lost exception, or callback retaining a disposed scope?
- Are `CancellationToken` and timeout properly propagated? Does cancellation preserve consistency after irreversible actions?
- Is concurrent work independent, bounded and free of shared EF Core `DbContext` usage?
- Are error handling, retry, idempotency, queue pressure and shutdown tested?
- Are async resources disposed and UI updates marshaled correctly for MAUI/Blazor?
- Are `Task.Run` and `ConfigureAwait(false)` used for a scenario-specific reason?
- Has a load/behavior test demonstrated the change rather than relying on folklore?

## Test suggestions
- A task-fault test confirms exceptions propagate/are logged.
- Cancel an in-flight operation and assert downstream cancellation and cleanup.
- Simulate one slow dependency and verify throughput stays bounded, not unbounded fan-out.
- Force several `Task.WhenAll` branches to fail and assert all relevant faults are observable.
- Verify DB writes with concurrent processing against separate contexts / independent transactions.
- For hosted services, verify shutdown, scope disposal, job restart/idempotency; use real infrastructure tests if correctness depends on it.
- For MAUI/Blazor, test UI-thread/renderer-bound state updates after `await`.
