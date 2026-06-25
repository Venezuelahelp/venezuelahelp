# Task 9 — Security Fix Report

## Files changed

- `backend/src/telegram/secret.ts` — added `getWebhookSecret()` loader (SSM `/venezuelahelp/telegram-webhook-secret`, graceful if absent); `__resetTokenCache` now also resets `cachedSecret`.
- `backend/src/telegram/handler.ts` — widened event type to include `headers`; added `getWebhookSecret` to `Deps`/defaults; secret-mismatch guard (returns 200 silently); `is_bot` self-guard.
- `backend/src/telegram/trigger.ts` — `isReplyToBot` now only matches our bot's username, not any `is_bot` flag.
- `infra/lib/bot-stack.ts` — `ssm:GetParameter` policy extended to include `telegram-webhook-secret` ARN.
- `backend/src/telegram/__tests__/handler.test.ts` — `getWebhookSecret: vi.fn(async () => "")` added to `deps()`; new secret-mismatch test; zero-retrieval test strengthened with `qaLogRepo.append` assertion and `sendMessage` content check.
- `infra/lib/__tests__/bot-stack.test.ts` — removed unused `expect` from vitest import.

## Commands run

```
npm test --workspace @venezuelahelp/backend -- telegram/__tests__/handler
# 5 passed (5)

npm test --workspace @venezuelahelp/backend
# 54 passed (54) — 21 test files

npm test --workspace @venezuelahelp/infra
# 7 passed (7) — 3 test files (esbuild re-bundled handler cleanly)

npm run build
# clean (tsc backend + infra, no errors)
```
