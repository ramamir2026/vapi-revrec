# Vapi RevRec — Technical Specification

This document is for an engineer reviewing or extending what Lovable scaffolds. It contains the database schema, Row-Level Security policies, Edge Function design, file storage policies, and the security model in full.

## 1. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Browser (React)                          │
│   Tailwind + shadcn/ui • Supabase JS client (anon key only)      │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Supabase Project (Cloud)                     │
│                                                                  │
│  ┌────────────┐   ┌──────────────┐   ┌───────────────────────┐   │
│  │  Auth      │   │  Postgres    │   │  Storage (private)    │   │
│  │  (Google,  │   │  (RLS on)    │   │  msas/, usage/,       │   │
│  │  vapi.ai)  │   │              │   │  outputs/             │   │
│  └────────────┘   └──────────────┘   └───────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │             Edge Functions (Deno runtime)                │    │
│  │             • analyze-msa     • monthly-close            │    │
│  │             Holds: ANTHROPIC_API_KEY (secret)            │    │
│  │             Uses:  service-role key for audit_log writes │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                   ┌───────────────────────┐
                   │   Anthropic API       │
                   │   claude-sonnet-4-6   │
                   └───────────────────────┘
```

The browser never touches the Anthropic API directly. The browser does not have the service role key. All audit log writes happen server-side from Edge Functions using the service role.

## 2. Database schema (Postgres / Supabase)

Run this in the Supabase SQL Editor on first setup. RLS policies are at the bottom.

```sql
-- ============================================================
-- USERS (profile, extends auth.users)
-- ============================================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role text not null default 'accountant' check (role in ('admin','accountant','viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Enforce vapi.ai domain on insert (Edge Function trigger handles this; defense in depth)
create or replace function public.enforce_vapi_domain()
returns trigger language plpgsql as $$
begin
  if not new.email like '%@vapi.ai' then
    raise exception 'Only @vapi.ai email addresses may sign up';
  end if;
  return new;
end $$;

create trigger trg_enforce_vapi_domain
  before insert on public.users
  for each row execute function public.enforce_vapi_domain();

-- ============================================================
-- CHART OF ACCOUNTS
-- ============================================================
create table public.chart_of_accounts (
  account_code text primary key,
  account_name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','revenue','expense','contra_revenue')),
  normal_balance text not null check (normal_balance in ('debit','credit')),
  is_active boolean not null default true,
  description text
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_id text unique not null,        -- kebab-case slug, e.g. 'acme-corp'
  legal_name text not null,
  domain text,
  primary_contact_email text,
  status text not null default 'active' check (status in ('active','paused','churned','renewal_pending')),
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

-- ============================================================
-- CONTRACTS (an MSA, plus any amendments)
-- ============================================================
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  customer_pk uuid not null references public.customers(id) on delete restrict,
  msa_storage_path text not null,           -- 'msas/{customer_id}/MSA.pdf'
  effective_date date not null,
  end_date date not null,
  term_months int generated always as (
    extract(year from age(end_date, effective_date))*12 +
    extract(month from age(end_date, effective_date))
  ) stored,
  total_contract_value numeric(14,2),
  billing_terms text,
  payment_terms text,
  has_minimum boolean not null default false,
  minimum_amount numeric(14,2),
  has_ramp boolean not null default false,
  ramp_terms_json jsonb,
  status text not null default 'active' check (status in ('active','terminated','amended','superseded')),
  parent_contract_id uuid references public.contracts(id),  -- non-null for amendments
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

create index idx_contracts_customer on public.contracts(customer_pk);

-- ============================================================
-- PERFORMANCE OBLIGATIONS
-- ============================================================
create table public.performance_obligations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  po_name text not null,
  description text,
  is_distinct boolean not null,
  is_series boolean not null default false,
  recognition_pattern text not null check (recognition_pattern in ('over_time_usage','over_time_ratable','point_in_time')),
  transaction_price_allocated numeric(14,2),
  recognition_basis text,                   -- e.g. 'usage-based output method'
  asc606_citation text,                     -- e.g. 'ASC 606-10-25-15'
  variable_consideration_treatment text,    -- e.g. 'allocation exception per ASC 606-10-32-40'
  created_at timestamptz not null default now()
);

create index idx_po_contract on public.performance_obligations(contract_id);

-- ============================================================
-- REVENUE SCHEDULE (forecast + actuals)
-- ============================================================
create table public.revenue_schedule (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  performance_obligation_id uuid not null references public.performance_obligations(id),
  period date not null,                     -- last day of month
  period_year int generated always as (extract(year from period)::int) stored,
  period_month int generated always as (extract(month from period)::int) stored,
  forecast_amount numeric(14,2) not null default 0,
  forecast_basis text,
  actual_amount numeric(14,2),
  variance_amount numeric(14,2) generated always as (coalesce(actual_amount,0) - forecast_amount) stored,
  status text not null default 'forecast' check (status in ('forecast','actual_posted','reversed')),
  posted_at timestamptz,
  posted_by uuid references public.users(id),
  je_id uuid,                               -- FK added below
  unique (performance_obligation_id, period)
);

create index idx_schedule_contract on public.revenue_schedule(contract_id);
create index idx_schedule_period on public.revenue_schedule(period);

-- ============================================================
-- USAGE UPLOADS (raw monthly input)
-- ============================================================
create table public.usage_uploads (
  id uuid primary key default gen_random_uuid(),
  customer_pk uuid not null references public.customers(id) on delete restrict,
  period_year int not null,
  period_month int not null,
  csv_storage_path text not null,
  raw_data_json jsonb not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.users(id),
  unique (customer_pk, period_year, period_month)
);

-- ============================================================
-- JOURNAL ENTRIES + LINES
-- ============================================================
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  je_number text unique not null,           -- e.g. 'JE-acme-corp-2026-01-001'
  contract_id uuid not null references public.contracts(id),
  customer_pk uuid not null references public.customers(id),
  period date not null,                     -- last day of month being recognized
  je_date date not null,                    -- typically same as period
  memo text not null,
  total_debit numeric(14,2) not null,
  total_credit numeric(14,2) not null,
  status text not null default 'draft' check (status in ('draft','posted','exported','reversed')),
  posted_at timestamptz,
  posted_by uuid references public.users(id),
  exported_at timestamptz,
  reversed_by_je_id uuid references public.journal_entries(id),
  supporting_memo_storage_path text,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  check (total_debit = total_credit)
);

create table public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  line_number int not null,
  account_code text not null references public.chart_of_accounts(account_code),
  debit_amount numeric(14,2) not null default 0,
  credit_amount numeric(14,2) not null default 0,
  customer_pk uuid references public.customers(id),
  description text,
  unique (journal_entry_id, line_number),
  check ((debit_amount > 0 and credit_amount = 0) or (credit_amount > 0 and debit_amount = 0))
);

alter table public.revenue_schedule
  add constraint fk_schedule_je foreign key (je_id) references public.journal_entries(id);

-- ============================================================
-- NDR SIGNALS
-- ============================================================
create table public.ndr_signals (
  id uuid primary key default gen_random_uuid(),
  customer_pk uuid not null references public.customers(id) on delete cascade,
  period date not null,
  signal_type text not null check (signal_type in ('renewal_window','expansion','contraction','flat','amendment','churn_risk')),
  signal_strength text not null check (signal_strength in ('high','medium','low')),
  description text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- AUDIT LOG (APPEND-ONLY)
-- ============================================================
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'analysis_run','monthly_close_run','customer_created','contract_created',
    'amendment_added','je_posted','je_exported','je_reversed','schedule_edited',
    'user_role_changed','revision_requested'
  )),
  customer_pk uuid references public.customers(id),
  contract_id uuid references public.contracts(id),
  je_id uuid references public.journal_entries(id),
  user_id uuid references public.users(id),  -- who triggered the action
  timestamp timestamptz not null default now(),
  action_summary text not null,              -- short, human-readable
  decision_made text,                        -- structured: what was decided
  alternative_considered text,               -- structured: what wasn't chosen
  asc606_citation text,
  judgment_call boolean not null default false,
  full_reasoning_text text,                  -- ONLY populated when judgment_call = true
  claude_model text,
  claude_input_tokens int,
  claude_output_tokens int,
  metadata jsonb
);

create index idx_audit_customer on public.audit_log(customer_pk);
create index idx_audit_timestamp on public.audit_log(timestamp desc);
create index idx_audit_judgment on public.audit_log(judgment_call) where judgment_call = true;

-- Append-only: revoke UPDATE and DELETE entirely, no policies will allow them
revoke update, delete on public.audit_log from authenticated, anon, service_role;
-- service_role can still INSERT (default grant on table creation); explicit grant for clarity:
grant insert, select on public.audit_log to service_role;
grant select on public.audit_log to authenticated;
```

## 3. Row-Level Security policies

```sql
-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.customers enable row level security;
alter table public.contracts enable row level security;
alter table public.performance_obligations enable row level security;
alter table public.revenue_schedule enable row level security;
alter table public.usage_uploads enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entry_lines enable row level security;
alter table public.ndr_signals enable row level security;
alter table public.audit_log enable row level security;
alter table public.chart_of_accounts enable row level security;

-- USERS: read your own profile + all profiles (it's an internal tool); admins update roles
create policy users_select on public.users for select to authenticated using (true);
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.users where id = auth.uid()));
create policy users_admin_update on public.users for update to authenticated
  using ((select role from public.users where id = auth.uid()) = 'admin');

-- ALL OPERATIONAL TABLES: any authenticated active user can read; accountants and admins can write
create policy ops_read on public.customers for select to authenticated using (true);
create policy ops_write on public.customers for all to authenticated
  using ((select role from public.users where id = auth.uid()) in ('accountant','admin'));
-- Repeat the above pattern for: contracts, performance_obligations, revenue_schedule,
-- usage_uploads, journal_entries, journal_entry_lines, ndr_signals, chart_of_accounts.
-- Viewers get read-only via the ops_read policy.

-- AUDIT LOG: read for all authenticated; writes only by service_role (Edge Functions).
create policy audit_read on public.audit_log for select to authenticated using (true);
-- No insert/update/delete policies for authenticated → only service_role can write.
```

## 4. Edge Functions

### `analyze-msa`

```typescript
// supabase/functions/analyze-msa/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.30.0";

const SYSTEM_PROMPT = await Deno.readTextFile("./system-prompt.md");

serve(async (req) => {
  const { customer_id, contract_id } = await req.json();

  // Authenticate the caller (must be a logged-in user)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify the caller is a Vapi user (defense-in-depth on top of RLS)
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user || !user.email?.endsWith("@vapi.ai")) {
    return new Response("Forbidden", { status: 403 });
  }

  // Load the MSA PDF text from storage and prior context
  const { data: contract } = await supabase
    .from("contracts").select("*").eq("id", contract_id).single();
  const { data: msaFile } = await supabase.storage
    .from("msas").download(contract.msa_storage_path);
  const msaText = await extractPdfText(msaFile);  // pdf-parse or similar

  // Build the Claude API call
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    thinking: { type: "enabled", budget_tokens: 4000 },
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `Workflow: New Customer Onboarding.

Customer ID: ${customer_id}
Contract ID: ${contract_id}

MSA text:
---
${msaText}
---

Apply the 5-step ASC 606 model. Produce structured JSON output with the following keys:
- contract_summary
- performance_obligations[]
- transaction_price
- allocation
- recognition_pattern
- revenue_schedule[]
- day_one_je
- judgment_calls[]
- analysis_memo_markdown

Each element of judgment_calls[] should have: decision, alternative, rationale, asc606_citation, judgment_call: true.
Routine decisions (where the answer is unambiguous) should NOT be in judgment_calls but should be reflected in analysis_memo_markdown.`
    }]
  });

  // Capture full response (including thinking blocks)
  const fullReasoning = JSON.stringify(response.content, null, 2);
  const structured = parseStructuredOutput(response);

  // Persist
  await persistAnalysis(supabase, customer_id, contract_id, structured);

  // Audit log entries — one summary row per analysis run, one detail row per judgment call.
  // For analysis_run events (new MSA or amendment), ALWAYS store full reasoning verbatim,
  // regardless of whether the agent flagged judgment calls. New contracts are the foundational
  // event for everything that follows — the strongest audit posture is full reasoning every time.
  await supabase.from("audit_log").insert({
    event_type: "analysis_run",
    customer_pk: structured.customer_pk,
    contract_id,
    user_id: user.id,
    action_summary: `Initial ASC 606 analysis run for ${customer_id}`,
    judgment_call: false,
    full_reasoning_text: fullReasoning,  // ALWAYS captured for new-MSA / amendment analyses
    claude_model: "claude-sonnet-4-6",
    claude_input_tokens: response.usage.input_tokens,
    claude_output_tokens: response.usage.output_tokens,
    metadata: { workflow: "new_customer" }
  });

  for (const jc of structured.judgment_calls) {
    await supabase.from("audit_log").insert({
      event_type: "analysis_run",
      customer_pk: structured.customer_pk,
      contract_id,
      user_id: user.id,
      action_summary: jc.decision,
      decision_made: jc.decision,
      alternative_considered: jc.alternative,
      asc606_citation: jc.asc606_citation,
      judgment_call: true,
      full_reasoning_text: fullReasoning,  // full reasoning ONLY on material calls
      claude_model: "claude-sonnet-4-6"
    });
  }

  return new Response(JSON.stringify(structured), {
    headers: { "Content-Type": "application/json" }
  });
});
```

### `monthly-close`

Same shape, different prompt. Loads prior context (contract, POs, prior schedule, prior closes), passes the new period and usage data, asks Claude for: recognized amount, variance, JE, NDR signals, audit entry. Same audit logging discipline.

## 5. File storage policies

Three private buckets:

```sql
insert into storage.buckets (id, name, public) values
  ('msas', 'msas', false),
  ('usage', 'usage', false),
  ('outputs', 'outputs', false);

create policy "Authenticated read msas"
  on storage.objects for select to authenticated
  using (bucket_id = 'msas');
create policy "Accountants write msas"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'msas' and (select role from public.users where id = auth.uid()) in ('accountant','admin'));

-- Same pattern for 'usage' and 'outputs' buckets.
```

Path convention: `{bucket}/{customer_id}/...`. Edge Functions use signed URLs (1-hour expiry) when handing files back to the browser; never expose direct paths.

## 6. JE export format

See `07-je-export-format.md`. Universal CSV with one row per debit/credit line.

## 7. Secrets management

Set in Supabase → Edge Functions → Secrets:
- `ANTHROPIC_API_KEY` — your Anthropic API key, never exposed to client
- `SUPABASE_SERVICE_ROLE_KEY` — auto-set by Supabase
- `SUPABASE_URL` — auto-set by Supabase

Browser-side env (safe to expose):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 8. Audit log discipline

Every state change writes one or more `audit_log` rows. The single source of truth for "what happened, when, why":

| Event | Triggered by | `judgment_call` | `full_reasoning_text` |
|---|---|---|---|
| **Analysis run (overall) — new MSA** | `analyze-msa` | false | **full Claude response (always)** |
| Analysis run (each judgment call) | `analyze-msa` | true | full Claude response |
| **Amendment analysis (overall)** | `analyze-msa` (amendment mode) | false | **full Claude response (always)** |
| Monthly close (overall) | `monthly-close` | false | null |
| Monthly close (each judgment call) | `monthly-close` | true | full Claude response |
| Customer created | UI action | false | null |
| JE posted | UI action | false | null |
| JE exported | UI action | false | null |
| JE reversed | UI action | true | full reasoning required |
| User role changed | UI (admin) | false | null |
| Revision requested by user | UI | false | null (the re-run analysis will log full) |

**Why analysis runs always get full reasoning:** A new MSA (or an amendment) is the foundational decision for everything that follows in that customer's revenue lifecycle. Every monthly close is built on top of the initial treatment. If an auditor ever asks "why did we treat this contract this way," the answer must include the model's verbatim reasoning, not a summary — even if no individual decision was flagged as a judgment call. Monthly closes follow the lighter discipline (full only on flagged judgment calls) because they apply prior decisions rather than make new ones.

Append-only is enforced at the database level — no UPDATE or DELETE grants on `audit_log` for any role except `service_role`'s INSERT.

## 9. What's deferred to Phase 2

- Push JEs directly to QBO/NetSuite/Xero (currently CSV export only)
- Live customer cube integration (currently manual CSV upload)
- Multi-element contracts with implementation fees, hardware, support tiers (Phase 1 handles single-element usage-based + platform fees)
- Two-person approval workflow (Phase 1 is single-user posting)
- SOC 2 controls and pen-test (when Vapi enters formal compliance)
- Email notifications on close due / variance breached
