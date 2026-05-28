-- ============================================================================
-- MIGRATION: policy_alignment_v1
-- Date: 2026-05-28
-- ============================================================================

alter table public.performance_obligations
  add column stream_classification text
    check (stream_classification in (
      'pilot',
      'platform_license',
      'usage_minutes_banks',
      'metered_usage',
      'needs_clarification'
    )),
  add column treatment_basis text
    check (treatment_basis in ('straight_line', 'consumption', 'cash')),
  add column is_interim boolean not null default false,
  add column intended_end_state_treatment text,
  add column policy_citation text,
  add column billing_type text
    check (billing_type in (
      'monthly_in_advance',
      'monthly_in_arrears',
      'annual_in_advance',
      'prepaid_balance',
      'usage_billed_arrears',
      'one_time_upfront',
      'unknown'
    ));

comment on column public.performance_obligations.stream_classification is
  'Vapi revenue stream this PO belongs to. Determines treatment_basis and JE pattern.';
comment on column public.performance_obligations.treatment_basis is
  'How revenue is recognized: straight_line (Streams 1/2/3), consumption (Stream 4), or cash (Self Serve, out of scope for this agent).';
comment on column public.performance_obligations.is_interim is
  'True when treatment_basis differs from intended ASC 606 end state (e.g., Stream 3 straight-line interim, end state consumption).';
comment on column public.performance_obligations.policy_citation is
  'Vapi RevRec Policy section that governs this PO (e.g., "Vapi Policy: Usage Minutes & Usage Banks").';

alter table public.revenue_schedule
  add column treatment_basis text
    check (treatment_basis in ('straight_line', 'consumption', 'cash')),
  add column is_interim_recognition boolean not null default false,
  add column actual_consumption_units numeric(14,4),
  add column actual_consumption_unit_label text,
  add column actual_consumption_rate numeric(14,6);

comment on column public.revenue_schedule.treatment_basis is
  'Recognition method applied for this period. Should match the parent PO unless explicitly overridden.';
comment on column public.revenue_schedule.actual_consumption_units is
  'Tracked for Stream 3 (Usage Minutes & Banks) even under straight-line interim, so end-state migration has historical consumption data to validate.';

alter table public.audit_log
  add column policy_citation text;

comment on column public.audit_log.policy_citation is
  'Vapi RevRec Policy section cited for this decision. Complements asc606_citation; both should be populated where applicable.';

create index if not exists idx_po_stream
  on public.performance_obligations(stream_classification);
create index if not exists idx_schedule_treatment
  on public.revenue_schedule(treatment_basis);
create index if not exists idx_po_interim
  on public.performance_obligations(is_interim) where is_interim = true;
