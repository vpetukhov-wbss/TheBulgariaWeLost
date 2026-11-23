# Testing and verification pyramid (risk-based)

1. Convert acceptance criteria into test cases with business language before coding. Happy/edge/failure/concurrent/security/tenant cases.
2. Unit tests for complex pure domain rules; assert behavior/state rather than private implementation details.
3. Component and feature tests for application decisions; use fakes at actual external seams.
4. Integration tests with real relational DB/provider (Testcontainers) for SQL translation, constraints and transactions.
5. `WebApplicationFactory` + HTTP tests for request pipeline, serialization, auth, validation and DI.
6. Test message handlers and Outbox with duplicate delivery, out-of-order messages, missing dependencies, poison queue and restart.
7. Contract tests for external providers and public events; version/tolerant reader strategy.
8. E2E UI only for critical user journeys; avoid relying exclusively on fragile broad E2E suites.
9. Blazor component tests (eg bUnit if adopted) for loading/error/validation/auth UI; backend authorization still separately tested.
10. MAUI view models unit-tested; device lifecycle, native permissions and signing verified on real/emulated devices.
11. Fast deterministic unit CI, realistic integration on PR, nightly load/security/e2e for higher cost suites.
12. No production credentials/resources; isolated DB per test or transaction/cleanup strategy; careful with parallel tests and global environment settings.
13. Avoid arbitrary Task.Delay; use bounded eventually/wait-for-condition loops for asynchronous consistency.
14. Property-based tests where domains have algebraic invariants; approval/snapshot tests only for stable intentional contracts.
15. Mutation testing can expose weak assertions but is not a release requirement for trivial changes.
16. Performance test against explicit P95/throughput/resource targets, with warmup and realistic data.
17. Coverage is a signal, not guarantee; prioritize correctness of critical failure paths.
18. Regression test reproduces bug **before** fix where feasible; assert precise causal behavior.
19. Record test commands and outputs; a test not executed must be marked not executed.
20. Pipeline fails on real test failures rather than hiding behind `|| true`.

Source groups: NC02, AM04, AM07, MJ03, MS07.
