---
name: angular-feature
description: "Implement one vertical Angular feature with accessible UI, typed API integration and behavioral tests."
---

# angular-feature

## Procedure
1. Locate the feature, route, design system, existing state patterns and API contract; define happy/empty/error/loading/denied/slow states.
2. Implement feature-scoped route + components suited to the installed Angular version, with separate `.ts`, `.html`, styles, `.spec.ts` by project naming convention.
3. Use type-safe forms and validation where needed, signals/computed or RxJS by behavior, keep DOM/template logic light.
4. Integrate HttpClient through typed service or client; map transport failures to useful UX without hiding failures.
5. Add tests and accessibility checks, run real project commands; report exact outcomes, untouched/unknown platform cases and risks.

## Deliverables
Summarize scope and choices, changed files, verified commands/results, evidence, risks and required human approvals.

## References
`knowledge/ANGULAR_PLAYBOOK.md`, `knowledge/ANGULAR_SOURCES.md`.
