# EF Core, SQL and persistence

1. Define ownership, consistency and migration budget before building schema. No shared writable tables across autonomous services.
2. Inspect generated SQL, query plan, indices and cardinality before assuming LINQ is efficient.
3. Use `Select` projection for read DTOs; avoid full tracked entities when only a few columns are needed.
4. Read-only queries: `AsNoTracking()` as appropriate; preserve tracking for updates, identity semantics where needed.
5. Avoid lazy-loading N+1 and accidental cartesian explosions; choose `Include`, projection or split queries with knowledge of extra round trips and consistency.
6. Limit results, stable deterministic ordering; keyset pagination when sequential cursor navigation and scale justify it; `Skip/Take` with stable order when arbitrary page jumps are needed.
7. Build indexes for predicates and order patterns; consider covering and filtered indexes only with plans/workload evidence; monitor write penalty.
8. Never enumerate query before filtering/paging; avoid `ToList()` halfway through server-side predicate construction.
9. Async query methods with `CancellationToken`; treat timeouts and transient failures explicitly.
10. DbContext is a unit-of-work boundary, not thread-safe; scope it and don't reuse across concurrent tasks or long-lived UI state.
11. Avoid redundant generic repository layers over EF Core unless they represent a meaningful domain/persistence seam.
12. For simple transactional use case, one `SaveChangesAsync` may suffice; use explicit transaction for multi-save atomicity and integration requirements.
13. Configure optimistic concurrency tokens (rowversion or appropriate provider token) and return a useful conflict outcome; test racing writers.
14. Schema: unique constraints and FKs enforce facts; don't rely only on application validation to prevent duplicates.
15. Tenant/soft-delete filters: test bypass and admin scenarios; global filters are not a substitute for authz.
16. Prefer migrations as source controlled artifacts; review generated destructive operations, columns and defaults.
17. Use expand → migrate/backfill → contract for zero-downtime schema rollouts; backup and rehearse at realistic scale.
18. Seed test data isolated from production; Testcontainers with real provider catches dialect, transactions, indexes and mapping issues.
19. SQL injections: compose LINQ or parameterize raw SQL; validate user-driven sort fields against whitelist.
20. Profile slow queries and blocking with production-like row count; consider Dapper/native SQL for proven hot read paths, not as reflex.
21. Outbox storage requires atomic commit with business data, retry, idempotent consumers, backlog monitoring and retention.
22. Data privacy: encryption/key management, retention, deletion/audit requirements and restore procedures belong in design.
23. Distinguish offset/UTC/time zone storage explicitly; avoid implicit conversions.
24. Explain eventual consistency and stale projections to UX/API consumers; not every update is instantly searchable.
25. Measure performance with P95 + query count + logical reads; document before/after to justify any tuning.

Source groups: MS02, AM02–AM04, MJ05, MJ06.
