# Razor & Blazor component engineering

1. Know the difference: Razor Pages (`.cshtml` + `.cshtml.cs`), Blazor components (`.razor` + optional `.razor.cs` + `.razor.css`), MVC views. Never create a fake `.razor.html` file.
2. For complex components, split `OrderEditor.razor` markup, `OrderEditor.razor.cs` partial behavior, `OrderEditor.razor.css` isolated styling. Keep each cohesive.
3. Favor composition of small components with explicit parameters and `EventCallback<T>`, not giant parent components.
4. Choose render mode explicitly: Static SSR for content/forms where possible; Interactive Server for low-payload server-controlled UI; WebAssembly for client execution/offline cases; Auto only with understood boundaries.
5. Blazor WASM/Hybrid browser-side code is untrusted; enforce authorization and business rules on the API or server.
6. Use typed request/response contracts, predictable validation, well-designed loading/empty/error states and optimistic UX only when conflict recovery exists.
7. Account for lifecycle and prerender twice-run effects; browser JS interop only when environment is interactive.
8. Unsubscribe/dispose events, JS modules and timer resources to prevent leaks; cancel old async requests on navigation/filter changes.
9. Avoid accidental re-render loops; use `@key` for identity; understand state flow and lifecycle before overriding `ShouldRender`.
10. Use `Virtualize` for genuinely large visible-scroll lists; pair with server pagination for huge datasets.
11. Minimize `CascadingValue` changes and huge parameter sets; avoid broad mutable shared state that causes wide rerenders.
12. Validate both UX and backend; `AuthorizeView` hides controls but does not grant/deny server operations.
13. Use EditForm/EditContext carefully, validation summaries/messages, explicit submit state and double-submit protection.
14. CSS isolation for local component styles; design tokens/shared CSS for true common patterns; avoid `!important` cascade wars.
15. Accessibility: semantic forms, labels, keyboard/focus management, ARIA only where native semantics insufficient, contrast and responsive layout.
16. Test auth/session expiry, SignalR disconnect/reconnect for server interactivity, offline browser, slow requests, JS interop errors.
17. Minimize huge JS interop payloads and chatty calls; prefer batch transfer where measured.
18. Avoid putting business workflows solely in code-behind, keep orchestration in a feature/service with tests.
19. Protect against XSS and unsafe HTML (`MarkupString` only for trusted/sanitized content); encode by default.
20. Server-side interactive UI: understand circuit lifetimes and scoped services; don't persist scoped `DbContext` blindly across UI operations.
21. UI performance must be measured with real components, latency and browser profiling rather than speculative micro-optimizations.

Source groups: MS04–MS06, MS13, MS14.
