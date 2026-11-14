---
paths:
  - "**/*.cs"
---
# C# async/await and bounded concurrency
- Read `knowledge/ASYNC_AWAIT_CONCURRENCY.md` for examples, exceptions, and official references before non-trivial async changes.
- Avoid sync-over-async (`.Result`, `.Wait`, blocking `GetResult`) on request/UI paths; use `Task`-returning APIs and `await` end-to-end.
- `async void` only for event signatures that demand it; no unobserved/unowned Tasks or request-scoped fire-and-forget jobs.
- Propagate cancellation to I/O; distinguish caller cancellation from timeout/transient fault and preserve committed side effects.
- Use `Task.WhenAll` only for independent, bounded work. Apply backpressure to media processing and file transfers.
- Avoid `Task.Run` for already-async I/O or as an ASP.NET Core throughput workaround; choose background workers for owned long work.
- Don't await under lock/monitor; use async coordination with `try/finally` when needed.
- Use normal `await` in ASP.NET Core application code. Follow the established policy in reusable libraries.
- `Task.Delay` is valid for cancellable waits, but isn't a durable scheduler; use background services/queues where warranted.
- Review cancellation, exceptions, resource lifetimes, concurrent updates and rollback behavior with tests; do not claim faster without measurement.
