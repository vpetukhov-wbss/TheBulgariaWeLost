# Solution proposal: <capability>

## One-paragraph recommendation
Business problem, value, chosen structure and why now.

## What is verified and what is assumed
| Item | Evidence | Status/owner |
|---|---|---|

## Alternatives and tradeoff scorecard
| Option | Delivery time/cost | Maintenance | Reliability | Scaling | Security/data | Decision |
|---|---|---|---|---|---|---|
| Simplest viable | | | | | | |
| Alternative | | | | | | |

## C4-style context and container topology (text or Mermaid)
Users → client → API → owned DB / external systems. Explicit security boundaries.

## Bounded contexts and domain events
- Data owner and transaction boundary:
- Business invariants:
- Commands/queries:
- External contract versioning:

## API/data/deployment
- Schemas, indexes, migrations, concurrency:
- Endpoints, authz, retry/idempotency:
- Observability, budgets, hosting, CI:
- Rollout, compatibility, rollback:

## Delivery slices and evidence
| Slice | Acceptance tests | Dependencies | Estimate range | Risks |
|---|---|---|---|---|

## Decisions and open risks
- ADR link:
- Security threat model:
- Failure scenario:
