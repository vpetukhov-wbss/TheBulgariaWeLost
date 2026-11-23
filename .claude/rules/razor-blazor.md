---
paths:
  - "**/*.razor"
  - "**/*.razor.cs"
  - "**/*.razor.css"
  - "**/*.cshtml"
---
# Razor and Blazor rules
- Keep significant component logic in `Name.razor.cs` partial class and component style in `Name.razor.css`; Razor owns markup. `.razor.html` is not a Blazor file convention.
- Pick Static SSR / Interactive Server / WebAssembly / Auto according to latency, offline, SEO, network and trust. Don't default to interactive everything.
- Business validation and authorization must be enforced on server/API; `AuthorizeView` is UI visibility, not a security boundary.
- Use `@key` for stable list identity, Virtualize when long scroll lists justify it, avoid unnecessary cascading parameters and render-trigger loops.
- Cancel/dispose subscriptions and timers; handle concurrent calls/reconnect/loading/error/empty states; accessible labels, keyboard focus and validation messages.
- Keep JS interop behind small modules; consider prerendering/hydration and lifecycle when invoking browser-only APIs.
