# Production performance and observability

1. Establish workload, traffic shape, SLO, P50/P95/P99 latency, memory and CPU before optimization.
2. Trace request end-to-end across incoming HTTP, DB, outgoing HTTP and async handler; use trace/context propagation.
3. Structured logging with stable field names, appropriate levels, no PII/credentials; avoid chatty debug in production.
4. Monitor RED (rate, errors, duration) for services and USE (utilization, saturation, errors) for infrastructure.
5. Hot ASP.NET Core paths: avoid sync-over-async, unnecessary allocations, giant response bodies, blocking work in request pipeline.
6. EF indexes, projections, tracking, pagination and query plans usually beat low-level runtime tricks.
7. Connection pooling and timeouts for outgoing HTTP, DB and broker; observe saturation and queueing.
8. Caching requires explicit eviction/key/tenant isolation and consistency budget; test cache stampedes.
9. Batch external work carefully; throughput boosts may break ordering and increase failure blast radius.
10. Profiling: BenchmarkDotNet for local micro-optimizations, load tests and distributed tracing for systemic bottlenecks.
11. For Blazor, verify rendering, component count, scroll virtualization, lifetime/disposal and JS interop payloads.
12. For MAUI, profile on physical devices for startup, memory and frame latency; inspect images and binding/update frequency.
13. Alerts must reflect actionability; include diagnostic links, ownership and runbook, with noise budget.
14. Design capacity tests for peak seasonal bursts and cold starts; rehearse degraded dependency behavior.
15. Document observed baseline, modification and after-measurement. Do not state an optimization is faster without evidence.

Source groups: MS01, MS02, MS05, MJ06, NC03, AM05.
