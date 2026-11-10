# Angular + ASP.NET Core boundaries

- Keep business invariants, authentication decisions, authorization, payment logic and persistence on the server.
- Use OpenAPI and contract verification for request/response/error structures. Avoid contradictory handwritten frontend validation and DTO semantics.
- Decide same-origin reverse proxy/BFF versus cross-origin SPA consciously; document CSRF/XSRF, cookies, CORS, OIDC, trust proxy headers and deployments.
- Match ASP.NET `ProblemDetails`/validation error conventions accurately, include correlation IDs and safe error messages.
- Model pagination, filtering, ETags/version tokens, retry/idempotency and rate limiting explicitly; do not retry non-idempotent writes by default.
- Integration smoke must cover frontend route -> real API -> authorized data path in staging, not only mocked Angular tests.
- Version API contracts and frontend bundles for safe rollback; avoid serving frontend with incompatible backend contract.
