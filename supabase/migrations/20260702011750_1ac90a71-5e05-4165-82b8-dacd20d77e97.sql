CREATE OR REPLACE FUNCTION public.set_contract_term_months()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  new.term_months :=
    extract(year from age(new.end_date + interval '1 day', new.effective_date))::int * 12
    + extract(month from age(new.end_date + interval '1 day', new.effective_date))::int;
  return new;
end $function$;

UPDATE public.contracts
SET term_months = extract(year from age(end_date + interval '1 day', effective_date))::int * 12
                  + extract(month from age(end_date + interval '1 day', effective_date))::int;