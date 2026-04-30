import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { CustomerStatus } from "@/components/StatusPill";
import { fmtUSD, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  useEffect(() => { document.title = "Dashboard · Vapi RevRec"; }, []);

  const { data: customers } = useQuery({
    queryKey: ["dashboard_customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, customer_id, legal_name, status, created_at, contracts(id, effective_date, end_date, total_contract_value, status)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard_stats"],
    queryFn: async () => {
      const [{ count: customerCount }, { count: contractCount }, { count: jeCount }, { count: openJeCount }] = await Promise.all([
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase.from("contracts").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("journal_entries").select("*", { count: "exact", head: true }),
        supabase.from("journal_entries").select("*", { count: "exact", head: true }).eq("status", "draft"),
      ]);
      return { customerCount, contractCount, jeCount, openJeCount };
    },
  });

  return (
    <AppLayout>
      <PageHeader
        title="Dashboard"
        description="Customers, contracts, and the open close queue."
        actions={
          <Button asChild size="sm">
            <Link to="/onboard">Onboard customer</Link>
          </Button>
        }
      />
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Customers" value={stats?.customerCount ?? "—"} />
        <Stat label="Active contracts" value={stats?.contractCount ?? "—"} />
        <Stat label="Total JEs" value={stats?.jeCount ?? "—"} />
        <Stat label="Drafts pending post" value={stats?.openJeCount ?? "—"} />
      </div>
      <div className="px-6 pb-8">
        <h2 className="text-sm font-medium mb-2">Customers</h2>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Active contract</th>
                <th className="px-3 py-2 font-medium">TCV</th>
                <th className="px-3 py-2 font-medium">Term ends</th>
              </tr>
            </thead>
            <tbody>
              {(customers ?? []).map((c) => {
                const active = c.contracts?.find((x: any) => x.status === "active") ?? c.contracts?.[0];
                return (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link to={`/customers/${c.customer_id}`} className="font-medium hover:underline">
                        {c.legal_name}
                      </Link>
                      <span className="text-muted-foreground ml-2 text-xs">{c.customer_id}</span>
                    </td>
                    <td className="px-3 py-2"><CustomerStatus status={c.status} /></td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {active ? `${fmtDate(active.effective_date)} – ${fmtDate(active.end_date)}` : <span>No contract</span>}
                    </td>
                    <td className="px-3 py-2 num">{active ? fmtUSD(active.total_contract_value) : "—"}</td>
                    <td className="px-3 py-2 num text-muted-foreground">{active ? fmtDate(active.end_date) : "—"}</td>
                  </tr>
                );
              })}
              {customers && customers.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground text-sm">No customers yet. <Link to="/onboard" className="underline">Onboard one</Link>.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="border border-border rounded-md px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold mt-0.5 num">{value ?? "—"}</div>
    </div>
  );
}
