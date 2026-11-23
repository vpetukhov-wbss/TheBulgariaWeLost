# Optional hooks (intentionally not enabled)

We do **not** auto-run formatting, tests or deployments on every file edit: it is expensive, can create edit loops, runs on untrusted projects and may mutate work unexpectedly. Invoke `bash scripts/quality-gate.sh <solution>` explicitly or integrate it into your existing CI.

If your organization adds deterministic Claude hooks, review the current official spec before enabling: https://code.claude.com/docs/en/hooks . Prefer a targeted PostToolUse format *verification* or a notification hook over format mutation; keep shell scripts audited and do not skip user confirmations for production actions. Test on throwaway branches first.

`settings.json` uses conservative deny rules. These are defense in depth, **not** a sandbox: guard cloud, database and IAM credentials with OS permissions and provider IAM.
