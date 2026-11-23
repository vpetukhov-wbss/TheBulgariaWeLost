# Architecture decision playbook

## Intake: evidence before structure
Capture actors, business events, CRUD vs invariants, lifecycle/volume, tenancy, compliance, auth, offline needs, peak throughput, SLO, budget, deployment team, integration count, migration, ownership, skill level. Create a context diagram and 3 concrete walkthroughs: success, failure, concurrent update. Mark unknowns and quantify high-risk assumptions.

## Decision matrix
| Situation | Starting point | Promote only when |
|---|---|---|
| Small CRUD, 1 team, weak invariants | ASP.NET Core minimal API/controllers + feature folders + EF Core | Domain complexity or bounded contexts emerge |
| Complex business invariants, 1 deploy | VSA + rich Domain + dependency boundaries, or pragmatic Clean Architecture | Measurable growth of modules and shared change coupling |
| Multiple bounded contexts, shared deployment | Modular Monolith; explicit module contracts, separate schemas/data ownership, architecture tests | Independent scaling/deployment or org ownership objectively needs services |
| Large independently owned services, ops maturity | Microservices with service-owned data, event contracts, retries, observability, delivery pipelines | Only after validating operational cost, data boundaries, network failure modes |
| Integration-heavy provider abstraction | Broker/adapter at resource seam; business services and thin exposers | External API or persistence independence is a real requirement |
| Blazor UI with SEO/limited interactivity | Static SSR first | Real interaction requires Interactive Server or WebAssembly |
| Offline native mobile/workflow | MAUI MVVM + API + local durable cache/sync strategy | Platform-specific API justified, conflict rules specified |

## Boundaries
- Model bounded contexts by business vocabulary, invariants, autonomy and rate of change; don't map one table to one microservice.
- Aggregate = transactional consistency boundary; avoid huge graphs and cross-aggregate ACID assumptions.
- No unauthorized cross-module DB table access; expose contracts, events or a query API.
- Decide read consistency and ownership; search/reporting projections may justify read models.
- API = transport not source of truth. Keep domain unaware of HTTP, EF Core, messaging and UI frameworks when domain complexity warrants it.
- No generic 'repository per entity' ritual if DbContext already covers the needs.

## CQRS, events and workflows
- Separate command/query types only where it makes behavior easier; distinct read store/database only if measurement/scale needs it.
- Commands should convey intent; idempotency keys for retried external entry points.
- For DB write + publish, use same-transaction Outbox, at-least-once delivery, consumer de-duplication and poison-message policy; don't promise exactly-once.
- Long cross-service workflows: saga with explicit compensation, deadlines, observability and manual recovery; avoid unsafe distributed transactions.
- Classify each side effect as transactional / reversible external / irreversible external; design order and recovery.

## Non-functional design budget
- Security: trust boundaries, least privilege, tenant isolation, authz at service boundary, PII protection.
- Reliability: timeout budget, retry policy with jitter and idempotence, circuit breakers only at meaningful boundaries, backpressure, health readiness/liveness.
- Performance: expected RPS, P95/P99, DB query count, cache policy, load-test gate, capacity and cost forecasts.
- Operability: logs, traces, metrics, alerts, dashboards, runbooks, migration strategy, rollback and SLO/error budget.
- Deployment: topology and target ops capacity; no K8s for simple single-app service without reason.

## Architecture proposal format
Problem → constraints → options scored on complexity/change cost/reliability/scale/team fit → explicit decision → dependencies → module/API/data boundaries → sequence diagrams (happy+failure) → tests → migration/rollout → unresolved risks → ADR.
