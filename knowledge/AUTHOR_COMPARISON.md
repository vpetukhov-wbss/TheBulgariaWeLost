# Author contributions: inspiration, not mandatory doctrine

| Source | Practical ideas to apply | Limits / deliberate deviations | Anchors |
|---|---|---|---|
| Milan Jovanović | Clean dependency rule; feature slices; CQRS when divergent reads/writes; rich domain invariants; modular monolith and enforced boundaries; Outbox and idempotent consumers; architectural tests | Don't generate layer/interface machinery for trivial CRUD; external events need reliability budgets | MJ01–MJ07 |
| Nick Chapsas | Improve everyday C# idioms, async/DI testing literacy; learn EF Core/Dapper tradeoffs; measure performance and learn from modern runtime behavior | Videos/course titles are not a universal architecture specification; any performance rule needs benchmark evidence | NC01–NC05 |
| Anton Martyniuk | Blend Clean + VSA pragmatically; disciplined EF Core queries and migrations; realistic integration tests, API security, structured logging, GitHub Actions/Docker | Individual articles contain optional library recommendations; choose libraries based on existing stack and lifecycle | AM01–AM08 |
| Derek Banas | OOP fundamentals, encapsulation, collections, LINQ, basic design patterns; simple examples that explain rather than mystify | Many examples are pedagogical and older: don't propagate old API/language or WPF patterns uncritically to .NET 10 / MAUI | DB01–DB02 |
| Hassan Habib (The Standard) | Purpose → Model → Simulate before coding; local broker abstraction at real I/O seams; descriptive business service operations, minimal code, testability, one responsibility, clear exception taxonomy | Strict Brokers → Services → Exposers is an **alternative primary architecture** to feature-first slices; do not stack both mechanically | HH01–HH03 |
| Microsoft Learn | Product-supported framework guidance, EF query semantics, Blazor lifecycle and security, MAUI MVVM and packaging, ASP.NET performance, C# version constraints | Prefer documentation version matching pinned runtime; samples may be didactic rather than production-complete | MS01–MS14 |

## Reconcile competing ideas
1. **Start from business capability and quality attributes**, not framework names.
2. Select **one structural spine**: simple features, Vertical Slices + constrained inner domain, modular monolith, or a justified distributed architecture. Optionally choose The Standard's Broker/Service/Exposer boundaries instead. Do not stack all by default.
3. Use an adapter/broker abstraction **only for a real volatile or external seam**, especially valuable when contract testing or provider substitution is needed.
4. CQRS is logical separation, not proof MediatR or two databases are needed. Use existing `IUseCase<TRequest,TResponse>` if project convention says so.
5. Optimization claims need measured workload and query/execution evidence.
6. Instructions are original synthesis; consult cited public sources for depth. Do not claim private paid-book content was read.
