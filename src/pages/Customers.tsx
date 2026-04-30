import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { CustomerStatus } from "@/components/StatusPill";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";

export default function Customers() {
  useEffect(() => { document.title = "Customers · Vapi RevRec"; }, []);
  const { data, isLoading } = useQuery({
    queryKey: ["customers_index"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, customer_id, legal_name, domain, primary_contact_email, status, created_at")
        .order("legal_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppLayout>
      <PageHeader
        title="Customers"
        actions={<Button asChild size="sm"><Link to="/onboard">Onboard customer</Link></Button>}
      />
      <div className="px-6 py-4">
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Legal name</th>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Domain</th>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : (data ?? []).map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link to={`/customers/${c.customer_id}`} className="font-medium hover:underline">{c.legal_name}</Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{c.customer_id}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.domain ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.primary_contact_email ?? "—"}</td>
                  <td className="px-3 py-2"><CustomerStatus status={c.status} /></td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(c.created_at)}</td>
                </tr>
              ))}
              {data && data.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No customers yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
