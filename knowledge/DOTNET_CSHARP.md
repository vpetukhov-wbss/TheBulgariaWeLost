# C# and .NET engineering playbook (practical synthesis)

## Modern language, correctness
1. Verify target `TargetFramework`, `Nullable`, `ImplicitUsings`, LangVersion; do not assume local SDK aligns with CI. .NET 10 ships with C# 14 as default, unless pinned.
2. Enable nullable reference analysis; treat warnings, initialization and external deserialization boundaries explicitly.
3. Prefer small cohesive public types per file, file-scoped namespaces and domain-language names; avoid `Utils/Helpers/Common/Manager` bags.
4. Use encapsulation around invariants; use records for genuine value-based equality, not blindly for tracked EF entities.
5. Value objects protect meaningful constraints; don't create a VO for every string regardless of domain needs.
6. Use static factory or validated constructors if invariants require it, not scattered partially initialized mutable state.
7. Choose pattern matching, switch expressions, collection expressions and primary constructors only when clearer than alternatives; don't rewrite stable code for syntax fashions.
8. Favor composition and polymorphism where behavior genuinely varies; resist inheritance pyramids.
9. Interfaces mark substitutable boundaries/test seams, not one interface per class ritual.
10. Keep dependencies explicit; constructor DI at composition root; scope lifetimes never crossed unsafely.
11. Keep shared mutable state rare and synchronized; understand closure capture and collection thread-safety.
12. Use `DateTimeOffset`/UTC for instants; `DateOnly`, `TimeOnly` for local calendar concepts; design time zones at boundaries.
13. Money: decimal + currency and deliberate rounding; never `double` for financial amounts.
14. Catch exceptions at meaningful boundaries; preserve stack, classify transient/expected errors, log once with correlation.
15. Model cancellation and timeout as outcomes; honor linked request cancellation in I/O, but avoid canceling irreversible work after commit.

## Async, resources and performance
16. Never block async with `.Result` or `.Wait()` in request/UI code; use `await` end-to-end.
17. Propagate `CancellationToken` to database, HTTP and long-running tasks; don't misuse `Task.Run` for server-side I/O.
18. Use `IAsyncDisposable`/`await using` for async-owned resources; dispose streams/response messages.
19. `HttpClientFactory` or long-lived clients with managed connection lifetime; prevent socket and DNS issues.
20. Bound parallelism (SemaphoreSlim/Channel/Dataflow) when fanout can overwhelm external services.
21. `IAsyncEnumerable<T>` for streaming when consumption and materialization justify it; verify DB context lifetime while enumerating.
22. `ValueTask` only when profiling justifies its complexity; `Task` remains the default.
23. Do not optimize by making everything `Span<T>`; measure allocations and profile hot paths with realistic data.
24. Cache only with key ownership, expiry/invalidation, tenant separation, stampede strategy and observed hit ratio.
25. Benchmarks require reproducible runs, representative allocations and latency; prefer BenchmarkDotNet for microbenchmarks plus production tracing for end-to-end evidence.

## Engineering experience
26. Centralize predictable formatting via `.editorconfig` / `dotnet format`; avoid style churn in feature PRs.
27. Use structured logging placeholders rather than interpolation to preserve fields and reduce disabled-log overhead.
28. Never suppress analyzers without documented rationale; fix high-value warnings first.
29. Validate options at startup (`ValidateOnStart`) for critical configuration; include fail-fast startup behavior.
30. Use established native framework features before another dependency; check license, maintenance, security and upgrades before adopting a package.

Source groups: NC01–NC05, AM03–AM06, MJ02, MS01, MS11 in SOURCES.md.
