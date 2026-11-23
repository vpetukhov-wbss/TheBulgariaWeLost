# Golden prompts (copy into Claude Code)

## New product feature
`/requirements-to-solution We need customer self-service order cancellation until production starts. Include authorization, concurrency with kitchen status, refunds, audit, API, Blazor UX, testing, deployment and rollback. Prefer minimal complexity. Do not code until architecture agreed.`

## Architecture choice
`/architecture-decision Current .NET monolith has Catalog, Orders, Production and Payments; three developers, 200 requests per minute, PostgreSQL. Compare feature-first monolith vs modular monolith vs microservices with cost, migration plan and architecture tests.`

## Feature implementation
`/dotnet-feature Implement the approved CancelOrder use case. Follow existing IUseCase<TRequest,TResponse> convention and keep one public model per file. Add real integration tests for race and tenant access. Run checks and report evidence.`

## Blazor
`/blazor-ui Implement OrderEditor.razor, OrderEditor.razor.cs and OrderEditor.razor.css. Loading/empty/error/validation, access control on server, responsive keyboard-friendly UI. Use existing styling conventions.`

## MAUI
`/maui-mobile Design a screen for a storekeeper scanning an order QR offline, queued synchronization and conflict resolution. Show native auth, permission UX, device tests, release checklist.`

## Database
`/efcore-data Review Orders queries for 1M rows, tenant filtering, deterministic ordering, cursor paging, proper indexes, concurrency and SQL explain plan. Only recommend optimizations with measurable reasoning.`

## Audit
`/code-review Review git diff from main. Prioritize correctness, missing authz, concurrency, query plans, breaking contracts, test gaps. Each finding must cite file:line and a reproducer. Don't edit code.`

## Infra
`/delivery-infrastructure Design a low-cost setup with Cloudflare Tunnel, WireGuard, Ansible, Jenkins and Gitea for a small .NET system, including secrets, backup/restore, observability and safe prod approval.`

## Testing
`/test-strategy Create a prioritized test plan for shipment creation across database and event bus. Include duplicate message handling, outbox, transaction failure, idempotency, parallel writes and authz.`
