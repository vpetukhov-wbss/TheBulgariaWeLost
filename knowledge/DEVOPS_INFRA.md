# CI/CD, deployment, infrastructure and operations

1. Choose topology from reliability, ownership, data locality, traffic and cost. Docker on one host is often better than premature Kubernetes.
2. All environments reproducible and documented; build once, promote immutable signed artifacts; separate secrets/configuration from images.
3. CI baseline: restore in locked mode if repository uses lock files; build → format/lint → unit/integration tests → SCA/secret scan → artifact.
4. Ensure branch protections and review requirements; stop deploying when gate fails.
5. Docker: multi-stage, minimal runtime, non-root, pin tool/image policy, `.dockerignore`, deterministic dependency restore, resource limits.
6. Health endpoints distinguish liveness/readiness; unhealthy external dependency should not necessarily trigger infinite restarts.
7. Graceful shutdown and connection draining for APIs and consumers; verify messages can resume after crash.
8. Secrets: secret store/CI vault, least privilege, rotation and access auditing; no `.env` checked into Git.
9. Database: expand/migrate/contract, backup/restore rehearsal, backwards compatible services; dangerous migration requires sign-off.
10. Deployment strategies: rolling for compatible APIs, blue-green/canary for risk, feature flags for decoupling launch from deployment.
11. Rollback: artifact version, DB backward compatibility, flag reversals, external event contract coexistence; test rollback before cutover.
12. Separate staging/prod infrastructure permissions; manual approval for prod including Apple/Google store releases.
13. Observability: OTel traces and logs, basic service-level metrics, correlation IDs, alert on user-impact symptom not noise.
14. Resilience: retry only transient idempotent operations; timeouts and budgets, jitter, circuit breaker when failures justify, rate-limit/backpressure.
15. Scaling: size by bottleneck (CPU, DB, network, broker), queue depth, concurrency and P95; load-test cost before buying capacity.
16. Outbox and consumer DLQ: monitor age/backlog/poison messages, replay instructions and retention.
17. Inventory third-party dependencies, license/security upgrades, SBOM/backup policy and incident runbooks.
18. Self-hosted: Cloudflare Tunnel can expose HTTP(S) without inbound port forwarding; secure sensitive administration via VPN/Access and isolate origin; no open Postgres/SSH to internet.
19. On-prem infrastructure: Ansible config, Jenkins pipelines and Gitea source control can coexist; guard Jenkins credentials, runners and Git branching access.
20. Aspire is useful to model, launch, and observe distributed apps locally; not a substitute for cloud runtime/deployment policy.
21. Infrastructure changes and deletion: explicit plan diff and approval; never auto-execute `terraform destroy`, `kubectl delete`, database drops.
22. Measure restore time/RPO/RTO and test backup recovery; backups without restore exercises aren't a disaster recovery strategy.
23. CI must cover target runtime(s), OS/platform constraints; iOS signing/release requires macOS/Xcode and platform provisioning.

Source groups: AM08, MJ04, MJ07, MS08, MS16. Cloudflare reference MJ07.
