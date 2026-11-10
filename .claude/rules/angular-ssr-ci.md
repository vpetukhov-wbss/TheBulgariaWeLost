---
paths:
  - "**/angular.json"
  - "**/server.ts"
  - "**/app.config.server.ts"
---
# SSR and deployment
- Choose CSR/SSG/SSR/hybrid on route-level product needs; do not opt into SSR merely for trendiness.
- Keep browser-only APIs behind platform checks; avoid serialization of secrets and leaking authenticated private HTML through shared caches.
- Define hydration, reverse proxy trusted header policy, CSP, asset caching, client routing fallback and environment-specific config.
- CI: lockfile install, lint, type/templates checks, unit tests, production build, targeted E2E and vulnerability/license policy.
- No deployment claims without actual environment verification; no unattended production release without approval.
