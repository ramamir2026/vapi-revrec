-- ENUMS
create type public.app_role as enum ('admin','accountant','viewer');

-- USERS (profile)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.enforce_vapi_domain()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if not new.email like '%@vapi.ai' then
    raise exception 'Only @vapi.ai email addresses may sign up';
  end if;
  return new;
end $$;

create trigger trg_enforce_vapi_domain
  before insert on public.users
  for each row execute function public.enforce_vapi_domain();

-- USER ROLES
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create index idx_user_roles_user on public.user_roles(user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = any(_roles))
$$;

-- handle_new_user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _role public.app_role;
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', null));
  if new.email = 'ram@vapi.ai' then _role := 'admin'; else _role := 'accountant'; end if;
  insert into public.user_roles (user_id, role) values (new.id, _role);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- CHART OF ACCOUNTS
create table public.chart_of_accounts (
  account_code text primary key,
  account_name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','revenue','expense','contra_revenue')),
  normal_balance text not null check (normal_balance in ('debit','credit')),
  is_active boolean not null default true,
  description text
);

-- CUSTOMERS
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_id text unique not null,
  legal_name text not null,
  domain text,
  primary_contact_email text,
  status text not null default 'active' check (status in ('active','paused','churned','renewal_pending')),
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

-- CONTRACTS (term_months populated by trigger, not generated)
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  customer_pk uuid not null references public.customers(id) on delete restrict,
  msa_storage_path text not null,
  effective_date date not null,
  end_date date not null,
  term_months int,
  total_contract_value numeric(14,2),
  billing_terms text,
  payment_terms text,
  has_minimum boolean not null default false,
  minimum_amount numeric(14,2),
  has_ramp boolean not null default false,
  ramp_terms_json jsonb,
  status text not null default 'active' check (status in ('active','terminated','amended','superseded')),
  parent_contract_id uuid references public.contracts(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);
create index idx_contracts_customer on public.contracts(customer_pk);

create or replace function public.set_contract_term_months()
returns trigger language plpgsql set search_path = public as $$
begin
  new.term_months :=
    extract(year from age(new.end_date, new.effective_date))::int * 12
    + extract(month from age(new.end_date, new.effective_date))::int;
  return new;
end $$;

create trigger trg_contract_term_months
  before insert or update of effective_date, end_date on public.contracts
  for each row execute function public.set_contract_term_months();

-- PERFORMANCE OBLIGATIONS
create table public.performance_obligations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  po_name text not null,
  description text,
  is_distinct boolean not null,
  is_series boolean not null default false,
  recognition_pattern text not null check (recognition_pattern in ('over_time_usage','over_time_ratable','point_in_time')),
  transaction_price_allocated numeric(14,2),
  recognition_basis text,
  asc606_citation text,
  variable_consideration_treatment text,
  created_at timestamptz not null default now()
);
create index idx_po_contract on public.performance_obligations(contract_id);

-- JOURNAL ENTRIES
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  je_number text unique not null,
  contract_id uuid not null references public.contracts(id),
  customer_pk uuid not null references public.customers(id),
  period date not null,
  je_date date not null,
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

-- REVENUE SCHEDULE (extract on plain date IS immutable, generated columns ok)
create table public.revenue_schedule (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  performance_obligation_id uuid not null references public.performance_obligations(id),
  period date not null,
  period_year int generated always as (extract(year from period)::int) stored,
  period_month int generated always as (extract(month from period)::int) stored,
  forecast_amount numeric(14,2) not null default 0,
  forecast_basis text,
  actual_amount numeric(14,2),
  variance_amount numeric(14,2) generated always as (coalesce(actual_amount,0) - forecast_amount) stored,
  status text not null default 'forecast' check (status in ('forecast','actual_posted','reversed')),
  posted_at timestamptz,
  posted_by uuid references public.users(id),
  je_id uuid references public.journal_entries(id),
  unique (performance_obligation_id, period)
);
create index idx_schedule_contract on public.revenue_schedule(contract_id);
create index idx_schedule_period on public.revenue_schedule(period);

-- USAGE UPLOADS
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

-- NDR SIGNALS
create table public.ndr_signals (
  id uuid primary key default gen_random_uuid(),
  customer_pk uuid not null references public.customers(id) on delete cascade,
  period date not null,
  signal_type text not null check (signal_type in ('renewal_window','expansion','contraction','flat','amendment','churn_risk')),
  signal_strength text not null check (signal_strength in ('high','medium','low')),
  description text,
  created_at timestamptz not null default now()
);

-- AUDIT LOG (APPEND-ONLY)
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
  user_id uuid references public.users(id),
  timestamp timestamptz not null default now(),
  action_summary text not null,
  decision_made text,
  alternative_considered text,
  asc606_citation text,
  judgment_call boolean not null default false,
  full_reasoning_text text,
  claude_model text,
  claude_input_tokens int,
  claude_output_tokens int,
  metadata jsonb
);
create index idx_audit_customer on public.audit_log(customer_pk);
create index idx_audit_timestamp on public.audit_log(timestamp desc);
create index idx_audit_judgment on public.audit_log(judgment_call) where judgment_call = true;
revoke update, delete on public.audit_log from authenticated, anon, service_role;
grant insert, select on public.audit_log to service_role;
grant select on public.audit_log to authenticated;

-- ENABLE RLS
alter table public.users enable row level security;
alter table public.user_roles enable row level security;
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

-- POLICIES
create policy users_select on public.users for select to authenticated using (true);
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy users_admin_update on public.users for update to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy user_roles_select on public.user_roles for select to authenticated using (true);
create policy user_roles_admin_write on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy customers_read on public.customers for select to authenticated using (true);
create policy customers_write on public.customers for all to authenticated
  using (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));

create policy contracts_read on public.contracts for select to authenticated using (true);
create policy contracts_write on public.contracts for all to authenticated
  using (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));

create policy po_read on public.performance_obligations for select to authenticated using (true);
create policy po_write on public.performance_obligations for all to authenticated
  using (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));

create policy schedule_read on public.revenue_schedule for select to authenticated using (true);
create policy schedule_write on public.revenue_schedule for all to authenticated
  using (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));

create policy usage_read on public.usage_uploads for select to authenticated using (true);
create policy usage_write on public.usage_uploads for all to authenticated
  using (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));

create policy je_read on public.journal_entries for select to authenticated using (true);
create policy je_write on public.journal_entries for all to authenticated
  using (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));

create policy jel_read on public.journal_entry_lines for select to authenticated using (true);
create policy jel_write on public.journal_entry_lines for all to authenticated
  using (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));

create policy ndr_read on public.ndr_signals for select to authenticated using (true);
create policy ndr_write on public.ndr_signals for all to authenticated
  using (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));

create policy coa_read on public.chart_of_accounts for select to authenticated using (true);
create policy coa_write on public.chart_of_accounts for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy audit_read on public.audit_log for select to authenticated using (true);

-- SEED CHART OF ACCOUNTS
insert into public.chart_of_accounts (account_code, account_name, account_type, normal_balance, description) values
  ('1000','Cash','asset','debit','Operating cash account'),
  ('1100','Accounts Receivable - Trade','asset','debit','Customer invoices billed and unpaid'),
  ('1110','Allowance for Doubtful Accounts','asset','credit','Contra-AR for credit losses (ASC 326)'),
  ('1200','Contract Asset (Unbilled Receivable)','asset','debit','Revenue recognized but not yet billed (ASC 606-10-45-3)'),
  ('1300','Prepaid Expenses','asset','debit','Prepaid software subscriptions and similar'),
  ('1400','Deferred Contract Costs','asset','debit','Capitalized commissions and contract acquisition costs (ASC 340-40)'),
  ('2300','Contract Liability - Current','liability','credit','Deferred revenue billed and unearned current portion (ASC 606-10-45-2)'),
  ('2310','Contract Liability - Long-term','liability','credit','Deferred revenue billed and unearned long-term portion'),
  ('2400','Refund Liability','liability','credit','Estimated refunds and SLA credits owed to customers (ASC 606-10-32-10)'),
  ('4100','Subscription Revenue','revenue','credit','Fixed platform fees recognized ratably over time'),
  ('4200','Usage Revenue - Voice Minutes','revenue','credit','Per-minute voice consumption recognized as consumed'),
  ('4300','Professional Services Revenue','revenue','credit','Implementation training and onboarding services'),
  ('4400','Setup Fees Revenue','revenue','credit','One-time setup fees recognized over the contract life when not distinct'),
  ('4900','SLA Credits and Adjustments','contra_revenue','debit','Contra-revenue for SLA breaches and customer credits'),
  ('5100','Cost of Revenue - Infrastructure','expense','debit','Cloud and telephony infrastructure costs'),
  ('5200','Cost of Revenue - Third-party Services','expense','debit','Third-party model and platform pass-through costs'),
  ('5300','Amortization of Deferred Contract Costs','expense','debit','Amortization of capitalized commissions over the period of benefit')
on conflict (account_code) do nothing;

-- STORAGE BUCKETS
insert into storage.buckets (id, name, public) values
  ('msas','msas',false),
  ('usage','usage',false),
  ('outputs','outputs',false)
on conflict (id) do nothing;

create policy "Authenticated read msas" on storage.objects for select to authenticated using (bucket_id = 'msas');
create policy "Accountants write msas" on storage.objects for insert to authenticated
  with check (bucket_id = 'msas' and public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));
create policy "Accountants update msas" on storage.objects for update to authenticated
  using (bucket_id = 'msas' and public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));
create policy "Accountants delete msas" on storage.objects for delete to authenticated
  using (bucket_id = 'msas' and public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));

create policy "Authenticated read usage" on storage.objects for select to authenticated using (bucket_id = 'usage');
create policy "Accountants write usage" on storage.objects for insert to authenticated
  with check (bucket_id = 'usage' and public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));
create policy "Accountants update usage" on storage.objects for update to authenticated
  using (bucket_id = 'usage' and public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));
create policy "Accountants delete usage" on storage.objects for delete to authenticated
  using (bucket_id = 'usage' and public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));

create policy "Authenticated read outputs" on storage.objects for select to authenticated using (bucket_id = 'outputs');
create policy "Accountants write outputs" on storage.objects for insert to authenticated
  with check (bucket_id = 'outputs' and public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));
create policy "Accountants update outputs" on storage.objects for update to authenticated
  using (bucket_id = 'outputs' and public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));
create policy "Accountants delete outputs" on storage.objects for delete to authenticated
  using (bucket_id = 'outputs' and public.has_any_role(auth.uid(), array['accountant','admin']::public.app_role[]));