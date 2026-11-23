# Production readiness — evidence gate
For each line: **verified / blocked / unverified / not applicable**, with command, run ID or linked evidence.

| Area | Check | Status/evidence |
|---|---|---|
| Requirements | All agreed acceptance scenarios verified | |
| Build | Reproducible release build, pinned SDK and dependencies | |
| Testing | Unit, integration, auth, concurrency, failure and architecture tests | |
| Security | Threat model, least privilege, secrets/PII, scans | |
| API | Backward compatible or versioned, docs/contract tests | |
| Data | Migrations reviewed, backup and restore, rollback safety | |
| Async | Idempotency, retries, Outbox/DLQ/replay as needed | |
| Performance | SLO/P95/load testing, capacity/cost | |
| Observability | Traces, correlation, logs, dashboards, actionable alerts | |
| Operations | Owner, incident playbook, RTO/RPO and on-call | |
| Deploy | Staging, smoke tests, approvals, feature flag and rollback | |
| Mobile | iOS/Android release build, certs, privacy disclosures | |
| Audit | Change record, reviewer, release notes | |

**Release gate:** do not mark GO if blocker/unverified safety-critical controls. Human approval required for production.
