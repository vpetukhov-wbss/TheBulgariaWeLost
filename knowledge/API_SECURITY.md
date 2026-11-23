# API design, authentication, security and trust

1. Start with identity, actor, trust boundaries, authz, user/tenant ownership, abuse potential and sensitive data classification.
2. JWT/OIDC validation: issuer, audience, signature, expiry, algorithms, key rotation; don't invent custom crypto or token formats.
3. AuthN confirms who, authZ confirms can do what. Enforce permissions on every resource operation in Application/API, not just client UI.
4. Tenant boundaries checked in reads/writes and background handlers; prevent IDOR with ownership and tenant verification.
5. Data carrier validation (shape, size, allowed values) at ingress; business invariants at domain transition.
6. Prefer clear REST resources and stable contracts; endpoint naming and status codes consistent across API.
7. Use ProblemDetails (RFC 9457) error responses, stable error codes, traceId, don't expose exception internals.
8. Commands which can be retried or purchased require idempotency keys and concurrency controls; PATCH/PUT semantics documented.
9. Paginate/filter/sort with bounds and sort whitelist; server-side limits to avoid enumeration attacks.
10. Version externally consumed APIs intentionally and document breaking-change policy.
11. TLS for transport; HSTS and secure cookie settings where applicable; antiforgery for cookie-authenticated state-changing endpoints.
12. CORS is not authentication or authorization; strict allowed origins and credentials semantics.
13. Restrict payload size, upload type and storage location; malware scans/quarantine when uploads carry risk.
14. Rate-limit by meaningful principal/IP/tenant, backpressure, protect login and expensive workflows.
15. Secrets via managed stores, short-lived scoped credentials, secret scanning, never log tokens/passwords.
16. Implement structured audit for sensitive operations, with actor, target, outcome and tamper controls.
17. Use parameterized queries and output encoding; avoid path traversal, SSRF (egress allowlist/deny metadata endpoints) and unsafe deserialization.
18. Apply security headers where appropriate and verify reverse-proxy forwarded headers configuration.
19. Vulnerability/dep scans integrated into CI and patch strategy; document supply-chain licenses/SBOM for regulated deployments.
20. Threat model one critical flow: entry points, assets, roles, trust boundaries, abuse cases, mitigations and validation tests.
21. No auto-prod deploy, IAM changes or payment-affecting behavior without approval and rollout checks.

Source groups: AM06, MS03, MS06, MS12.
