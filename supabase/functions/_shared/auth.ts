import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export async function requireVapiUser(req: Request): Promise<
  | { ok: true; user: { id: string; email: string } }
  | { ok: false; status: number; error: string }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { ok: false, status: 401, error: "missing_authorization" };

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return { ok: false, status: 401, error: "invalid_token" };
  const email = data.user.email ?? "";
  if (!email.endsWith("@vapi.ai")) {
    return { ok: false, status: 403, error: "not_vapi_user" };
  }
  return { ok: true, user: { id: data.user.id, email } };
}

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
