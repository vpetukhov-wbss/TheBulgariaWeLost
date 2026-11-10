# Angular Engineering Playbook (version-aware)

## Architecture decision table
| Need | Default | Consider upgrading when |
| --- | --- | --- |
| Internal product/admin UI | Standalone feature-oriented CSR app | SEO/public content needs SSR/SSG |
| Marketing/catalog pages | SSG/SSR/hybrid per route | Personalized pages or real-time data complicates caching |
| Local UI state | `signal`, `computed`, component service | Complex async streams require RxJS |
| Remote server state | Typed HttpClient feature service + cache policy | Cross-feature coordination and invalidation require formal store |
| Shared component library | Narrow design-system components | Several consuming apps and stable design contracts |
| API contracts | OpenAPI with generated/verified types | Explicit handcrafted DTOs when generator adds more cost than value |
| Full stack | ASP.NET Core authoritative business logic + Angular frontend | BFF/OIDC for stringent security or SSR integration |

## Feature-first example
```text
src/app/
  orders/
    pages/order-list/
      order-list.ts
      order-list.html
      order-list.scss
      order-list.spec.ts
    data-access/
      orders-api.ts
    orders.routes.ts
  shared/ui/                  # only genuine cross-feature reuse
```

Do not create dozens of empty `core`, `shared`, `models`, `helpers` and `utils` folders speculatively. Align names with the version/project conventions; generated Angular files may use `.component.ts` suffix in older codebases.

## Data flow and concurrency
- API state belongs to server; client stores representation and staleness policy, not authority.
- Define cancel-on-navigation and switchMap/AbortSignal behavior; handle race between searches and responses.
- Use typed reactive forms and version tokens/ETags for update concurrency where backend supports them.
- Do not use RxJS for a constant value just to look sophisticated, or signals as a replacement for every transport stream.

## CSR versus SSR
- CSR suits authenticated dashboard UX. SSR/SSG helps discoverability, share previews and some performance cases; adds Node/edge, hydration, caching and privacy concerns.
- Avoid browser globals during SSR; use platform-aware boundaries. Test a real production rendering route.
- Require cache headers that separate personalized output; sanitize/escape server content and trust proxy headers only behind validated infrastructure.

## UX and performance
- Semantic HTML first; do not reinvent button, dialog or checkbox without reason.
- Lazy load feature routes and defer noncritical expensive widgets after profiling.
- Measure LCP, INP, CLS, JS payload, API p95 and errors; do not present benchmark guesses as facts.
- Respect mobile input, reduced-motion, large text, screen-reader and error focus.

## Security
- Client route guards are not authorization. API verifies permissions for every sensitive operation.
- Avoid `bypassSecurityTrust*` and raw HTML. Apply CSP/Trusted Types with actual compatibility tests.
- Use secure cookie or standards-based OIDC flows; plan CSRF/XSRF, SameSite, CORS and SSR identity propagation appropriately.
- No secrets or private URLs in public source or client bundles.

## Verification by risk
1. `npm ci` or existing project lockfile installation (never silently regenerate lockfile).
2. Lint/TypeScript and Angular strict template checks; no suppression to green the build.
3. Unit/component tests on installed runner. New Angular CLI projects commonly use Vitest; legacy may use other tools.
4. Production build and bundle budget inspection.
5. Contract and E2E tests against an isolated environment for business flows.
6. Accessibility automated + manual keyboard/screen reader, where available.
7. Staging smoke, headers/SSL, routes, source maps, cache, rollback and telemetry.

## Acceptance checklist
- User-visible acceptance criteria verified; errors/loading/empty/permission denied handled.
- Tests executed and pass; report skips explicitly.
- No duplicated source of truth or broad catch-all abstractions.
- UI usable by keyboard and adaptive to narrow viewports.
- Backend permission enforced; no unsafe HTML or bundled credentials.
- CI/deploy are repeatable and reversible.
