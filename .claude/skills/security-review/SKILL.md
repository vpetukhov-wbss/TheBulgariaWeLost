---
name: security-review
description: "Threat model .NET, Blazor and MAUI features for authentication, authorization, tenancy, secrets, supply chain and abuse."
---

# Security review (read-only unless explicitly asked to fix)
- Determine assets, principals, entry points, trust boundaries, data residency/privacy and audit obligations.
- Test authN/authZ separated; IDOR, cross-tenant object access, permission revocation, login/token/session handling.
- Probe SSRF, injection, XSS/MarkupString, antiforgery, file uploads, CORS/cookie/JWT config, rate limiting, excessive payloads and enumeration.
- Inspect log secrets/PII exposure, credential storage, cloud identity, CI secrets and dependency vulnerabilities.
- For Blazor WASM and MAUI, assume client code and UI policies are modifiable; rely on server authority.
- Prioritize exploitable findings with reproducible scenario, mitigation, test, residual severity. Do not print real secrets.
- If context includes live credentials, never repeat/exfiltrate them; recommend immediate rotation.
