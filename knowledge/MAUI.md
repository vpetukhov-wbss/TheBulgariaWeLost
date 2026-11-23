# .NET MAUI, Hybrid and mobile engineering

1. First verify OS/platform workloads, SDK, Xcode/Android toolchain, targets and provisioning; don't treat a desktop build as proof iOS builds.
2. Use MVVM for complex state; `.xaml` view, `.xaml.cs` view glue, dedicated ViewModel, domain/app services distinct.
3. Prefer compile-checked bindings and CommunityToolkit.Mvvm only when it fits existing dependencies and team policy.
4. Run navigation and network operations asynchronously; manage busy state, cancellation, race handling and duplicate taps.
5. Decide Shell navigation/deep-link contracts early, with parameter validation and authenticated route handling.
6. Mobile app owns no backend secrets; use secure token storage and system browser for OAuth/OIDC (PKCE where appropriate).
7. Never put long-lived credentials in source/assets/config that ship in app package; app binaries can be reverse engineered.
8. Offline requirements: identify read cache, queued writes, conflict policy, versioning, retries, dedupe and sync UX before implementing local DB.
9. Persist critical data intentionally; encrypt sensitive local storage as appropriate and design logout wipe.
10. Use HttpClientFactory/resilience as supportable, validate network reachability, airplane mode, slow/intermittent mobile networks.
11. Avoid doing CPU-heavy image processing/DB work on UI thread; marshal updates to main thread with framework APIs.
12. Profile startup, memory, bindings, collection views, layout depth and image size on real lower-end devices.
13. Design pixel densities, safe areas, keyboard overlap, dark mode, localization and accessibility from start.
14. Keep device-specific APIs behind explicit interfaces with platform implementations and unit-testable facades.
15. Ask permission at point of use with rationale, handle denial/revocation; minimize permission footprint.
16. Plan push notification credentials and token lifecycle; unsubscribe/register deliberately.
17. For Blazor Hybrid, understand native app and WebView trust boundary; perform login in system browser, not custom WebView.
18. Run functional tests on Android and iOS, including resume/background, process kill, deep links and sign-in/out.
19. Test signed Release builds (linking/AOT/trimming behaviors can differ); debug is not enough.
20. Release: bundle identifiers, signing, provisioning, privacy manifests/store disclosures, rollback/version policy, staged rollout, crash telemetry.

Source groups: MS07–MS10, MS15, NC05 (Dometrain MAUI examples).
