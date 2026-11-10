---
paths:
  - "**/*.ts"
  - "**/tsconfig*.json"
---
# TypeScript discipline
- Respect `strict`, `strictTemplates`, `noImplicitAny` and established lint/format config; do not switch them off to make the build pass.
- Avoid `any`, unsafe assertions, non-null `!` and implicit mutation when accurate modeling is possible. Prefer discriminated unions for states/results.
- No grab-bag `utils.ts`/`helpers.ts`. Keep one meaningful concept per file and avoid premature generic abstractions.
- No side effects in constructors, computed functions or templates. Cleanup long-lived resources.
- Never commit generated bundles, credentials or environment-specific secrets.
