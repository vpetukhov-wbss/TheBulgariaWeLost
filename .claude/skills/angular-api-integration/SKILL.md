---
name: angular-api-integration
description: "Implement and review typed Angular HttpClient integrations with the NestJS API."
---

# angular-api-integration

## Procedure
1. Obtain OpenAPI or backend definitions and map DTOs, validation and error envelope accurately.
2. Design HttpClient services with constrained API, cancellation/unsubscribe, timeouts and retry only when safe.
3. Use interceptors for shared auth/correlation/error concerns; never bury business behavior in interceptors.
4. Check CORS, anti-forgery for cookie flows, upload sizes, pagination and API versioning.
5. Unit/contract test response handling; list unverified backend assumptions.

## Deliverables
Summarize scope and choices, changed files, verified commands/results, evidence, risks and required human approvals.

## References
`knowledge/ANGULAR_ASPNET_INTEGRATION.md`, `knowledge/ANGULAR_PLAYBOOK.md`, `knowledge/ANGULAR_SOURCES.md`.
