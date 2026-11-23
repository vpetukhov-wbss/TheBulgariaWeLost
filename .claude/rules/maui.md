---
paths:
  - "**/*.xaml"
  - "**/*.xaml.cs"
  - "**/MauiProgram.cs"
  - "**/Platforms/**"
---
# .NET MAUI rules
- Use MVVM for stateful workflows; thin pages/code-behind, distinct ViewModel per screen when warranted; strongly typed binding with `x:DataType` when appropriate.
- Register dependencies with justified lifetimes; use async commands and cancellation for navigation/network work; avoid race conditions and UI-thread violations.
- Request platform permissions at point of use; use SecureStorage for appropriate secrets/tokens, never embed secrets in app binaries.
- Test real Android/iOS lifecycle (resuming, offline, process kill, deep links, orientation), permissions and release signing separately.
- Platform-specific implementations behind narrow interfaces; app identity, entitlements and certificates are deployment concerns needing human approval.
