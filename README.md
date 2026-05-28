# Vapi RevRec

## Updating the system prompt or policy doc

The Edge Functions (`analyze-msa`, `monthly-close`) load the system prompt and
the revenue-recognition policy from `.md` files. Supabase's managed deploy
pipeline does **not** bundle sidecar `.md` files, so each `.md` has a generated
`.ts` mirror that the function actually imports.

**The `.md` is the source of truth. The `.ts` is generated. Never edit the `.ts` by hand.**

After editing any of:

- `supabase/functions/analyze-msa/system-prompt.md`
- `supabase/functions/analyze-msa/vapi-rev-rec-policy.md`
- `supabase/functions/monthly-close/system-prompt.md`
- `supabase/functions/monthly-close/vapi-rev-rec-policy.md`

run:

```bash
npm run prompts:sync
```

### Drift protection

A vitest test (`src/test/edge-prompts-sync.test.ts`) runs
`npm run prompts:check` and fails CI if any `.ts` mirror is out of sync with
its `.md`. Because the test suite runs on every Lovable build, a stale prompt
cannot ship — the build breaks first with a message telling you to run
`npm run prompts:sync`.

If you want a second belt-and-braces layer locally, add a pre-commit hook
(e.g. via `husky`) that runs `npm run prompts:check`. The CI test is the
authoritative guard; the hook just shortens the feedback loop.
