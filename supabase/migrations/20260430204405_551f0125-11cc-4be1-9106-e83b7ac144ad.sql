-- Revoke broad EXECUTE; grant precisely
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.has_any_role(uuid, public.app_role[]) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_vapi_domain() from public, anon, authenticated;

-- has_role / has_any_role must be callable by authenticated for RLS to evaluate
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.has_any_role(uuid, public.app_role[]) to authenticated;