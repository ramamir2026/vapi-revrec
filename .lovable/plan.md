# Part 2: Place Vapi policy reference doc

## Changes
1. Copy `user-uploads://12-vapi-policy.md` → `supabase/functions/analyze-msa/vapi-rev-rec-policy.md`
2. Copy `user-uploads://12-vapi-policy.md` → `supabase/functions/monthly-close/vapi-rev-rec-policy.md`

## Notes
- No code edits to the Edge Functions in this part. Wiring `Deno.readTextFile(new URL("./vapi-rev-rec-policy.md", import.meta.url))` and appending it to the system prompt will happen in part 3 alongside the v2 prompt swap, so both ship together and we deploy once.
- Anthropic's Messages API accepts a single `system` string, so the loaded policy text will be appended to the existing system prompt with a clear `---` divider at function init — no SDK change.
- No deploy in this part.
