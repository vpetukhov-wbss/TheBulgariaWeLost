---
paths:
  - "**/*.cs"
  - "**/*.csproj"
  - "**/*.sln"
  - "**/*.slnx"
  - "**/global.json"
---
# C#/.NET focused rules
- Follow the repository's pinned target framework and C# version. Check the media service requirements before selecting its initial SDK.
- Prefer nullable enabled, analyzers, explicit access modifiers where idiomatic, file-scoped namespaces; one public application/domain type per file.
- Use `sealed` only with intent; records for immutable value semantics; `required`/constructors to protect construction invariants.
- Avoid premature Span<T>, pooling, reflection, allocations micro-optimizations. Measure hotspots first.
- Async I/O all the way, cancellation propagation, no `.Result`, `.Wait()` or `async void` except event handlers; never fire-and-forget without owned lifetime/error handling. For exception cases, bounded fanout, MongoDB transaction concurrency, background work and UI continuation rules, read `knowledge/ASYNC_AWAIT_CONCURRENCY.md` and `.claude/rules/dotnet-async-concurrency.md`.
- DI lifetimes carefully: no scoped dependency captured by singleton. Prefer constructor injection.
- Domain invariants live at the boundary of state change; distinguish validation of user input from business invariants.
- Errors are explicit: domain result for expected outcomes when suitable, exceptions for unexpected faults; stable HTTP ProblemDetails mapping.
- When touching production code, add focused tests for behavior and failure cases; keep diff scoped.
