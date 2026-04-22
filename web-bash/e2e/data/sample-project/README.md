# sample-project

A tiny fixture used by web-bash Playwright e2e tests. It seeds an in-memory
ZenFS mount at `/vault` so the app's file explorer + viewer can be exercised
without the FSA directory picker.

See `e2e/helpers/install-vault.ts` for the injection mechanism.
