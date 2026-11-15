---
paths:
  - "apps/api/**/*.ts"
  - "apps/api/**/*.json"
  - "apps/api/compose.yaml"
---
# NestJS API

- Organize features as modules. Keep controllers focused on HTTP and DTOs. Keep Mongoose schemas in the owning module and return explicit response DTOs.
- Preserve `/api/v1/auth/*` for the Angular client and `/api/admin/v1/*` for the back office. Maintain Swagger metadata and follow [the admin API contract](../../docs/admin/api.md) for new administrative routes.
- Use the current account and session for authorization. Access tokens carry role hints for UI navigation. Check current access policy, resources and administrator MFA in NestJS.
- Reuse conditional updates and session versions for token rotation and revocation. Keep sensitive responses private. Exclude passwords, tokens, SMTP/DB credentials and link hashes from logs and responses.
- Use one MongoDB transaction for a business state change and its required audit/outbox entries. Execute operations sequentially on the same session. Build indexes for actual queries and run integrations on a replica set.
- Keep file bytes, SFTP credentials and media processing with the [.NET service](../../docs/architecture.md#файлов-поток). NestJS owns metadata, rights and the job contract.
