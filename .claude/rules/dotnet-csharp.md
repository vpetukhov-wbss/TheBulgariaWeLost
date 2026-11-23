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

## Method and constructor design

- Prefer at most three parameters in authored methods and constructors. Scrutinize any signature with four or more parameters and any call with adjacent primitive arguments that can be swapped without a type error.
- Group parameters only when they describe a single domain concept or share a lifecycle. Use named arguments when a primitive or Boolean at a call site is ambiguous. Prefer named properties for response DTOs with many independent fields.
- Review framework signatures, public compatibility and cohesive value objects on their merits. Keep existing wire names, null semantics and ordering guarantees when refactoring serialization contracts.
- Review long or ambiguous signatures in changed code before publication. Record the rationale for any retained signature with four or more parameters. Keep fixes scoped to the current change.
