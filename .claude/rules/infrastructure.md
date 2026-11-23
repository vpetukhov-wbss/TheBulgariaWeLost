---
paths:
  - "**/Dockerfile"
  - "**/Dockerfile.*"
  - "**/compose*.yml"
  - "**/compose*.yaml"
  - "**/.github/workflows/**"
  - "**/deploy/**"
  - "**/*.tf"
  - "**/*.bicep"
  - "**/Jenkinsfile"
---
# CI/CD and infrastructure rules
- Infrastructure as code, immutable artifacts, pinned image/tool versions or digest policies, least-privilege identities.
- Build/test/scan before deploy; separate staging and production; production changes require approval and defined rollback.
- Containers: multi-stage build, non-root runtime where practicable, health endpoints, graceful shutdown, resource limits, no secrets in layers.
- DB migrations should be expansion-compatible; backup, dry run and rollback plan before data changes; never run destructive SQL blindly.
- Traces, metrics, structured logs, alerts, operational runbook and SLO are part of done for business-critical services.
- Cloudflare Tunnel may avoid inbound public ports for self-hosted services; protect admin access with identity/VPN and avoid accidentally exposing DB/SSH.
