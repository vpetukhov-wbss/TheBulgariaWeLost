---
paths:
  - "**/*.component.ts"
  - "**/*.component.html"
  - "**/*.component.scss"
  - "**/*.component.css"
  - "**/src/app/**/*.ts"
  - "**/src/app/**/*.html"
  - "**/src/app/**/*.scss"
  - "**/src/app/**/*.css"
---
# Components and structure
- Feature-first folder organization; colocate `.ts`, template, styles and test files; prefer one component/service per file.
- Keep components mostly for presentation and composition; delegate business logic to feature services or clearly-scoped facade as needed.
- Prefer standalone in modern projects, `inject()` for DI, `input()`/`output()`/`model()` when supported and appropriate.
- Use stable `track` expressions for `@for`; derived values belong in `computed`, not repeated template calculations.
- Never leak subscriptions; prefer `async` pipe, `toSignal` with appropriate injection context or `takeUntilDestroyed`.
- Preserve semantic HTML, keyboard operation, focus, responsive layout and loading/empty/error states.
