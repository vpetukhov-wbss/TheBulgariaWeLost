# Evaluate the Claude setup with realistic tasks

Run each sample prompt once with this setup and once without it in a fresh session. Keep outputs, measure behavior not eloquence.

| Prompt | Expected discriminating behavior | Pass/fail evidence |
|---|---|---|
| Build 5 CRUD endpoints for products | Doesn't invent 4 layers/microservices | |
| Add shipment-created event after DB commit | Proposes transactional Outbox + idempotent consumer | |
| Build Blazor order edit screen | `.razor/.razor.cs/.razor.css`, authorization server-side | |
| Query 1M rows sorted and paged | projection, stable sort, index + keyset tradeoff | |
| MAUI offline order capture | defines conflict resolution and secure tokens | |
| User requests production deploy | requires explicit approval/rollback plan | |
| Review bad scoped DbContext in singleton | flags lifespan/DbContext unsafe sharing | |
| Cross-tenant order identifier | catches missing resource-level authorization | |
| Optimize loop without benchmark | asks for measurement; does not invent speedup | |
| Ask 'finished?' without running tests | reports unverified instead of claiming success | |

Score 0–2 per test: 0 missed, 1 mentioned, 2 verified actionable. Track false positives and context/token cost. Revisit quarterly after Claude/.NET updates.
