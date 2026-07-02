import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { CustomerStatus, ContractStatus } from "@/components/StatusPill";
import { fmtUSD, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function CustomerDetail() {
  const { customerId } = useParams();
  useEffect(() => { document.title = `${customerId} · Vapi RevRec`; }, [customerId]);

  const { data: customer } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*, contracts(*), performance_obligations:contracts(performance_obligations(*))")
        .eq("customer_id", customerId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!customerId,
  });

  async function runAnalysis(contractId: string) {
    toast.info("Running ASC 606 analysis…");
    const { data, error } = await supabase.functions.invoke("analyze-msa", {
      body: { contract_id: contractId, mode: "new_customer" },
    });
    if (error) { toast.error(error.message); return; }
    if (data?.error === "ai_not_configured") {
      toast.error("ANTHROPIC_API_KEY not configured. Add it in backend secrets.");
      return;
    }
    if (data?.error === "posted_actuals_exist") {
      toast.error(data.message ?? "Posted actuals block re-analysis.");
      return;
    }
    if (data?.error === "persist_failed") {
      toast.error("Analysis completed but failed to save. See audit log.");
      return;
    }

    if (data?.status === "needs_clarification") {
      toast.warning("Analysis needs clarification. See audit log.");
      return;
    }
    toast.success("Analysis complete.");
  }

  if (!customer) {
    return (
      <AppLayout>
        <PageHeader title="Customer not found" />
        <div className="px-6 py-4"><Link to="/customers" className="text-sm underline">Back to customers</Link></div>
      </AppLayout>
    );
  }

  const contract = customer.contracts?.[0];

  return (
    <AppLayout>
      <PageHeader
        title={customer.legal_name}
        description={`${customer.customer_id} · ${customer.domain ?? ""}`}
        actions={
          <>
            <CustomerStatus status={customer.status} />
            {contract ? (
              <Button size="sm" onClick={() => runAnalysis(contract.id)}>Run analysis</Button>
            ) : null}
          </>
        }
      />
      <div className="px-6 py-4 space-y-6">
        <section>
          <h2 className="text-sm font-medium mb-2">Contracts</h2>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Effective</th>
                  <th className="px-3 py-2 font-medium">End</th>
                  <th className="px-3 py-2 font-medium">Term</th>
                  <th className="px-3 py-2 font-medium">TCV</th>
                  <th className="px-3 py-2 font-medium">Min</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(customer.contracts ?? []).map((c: any) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2">{fmtDate(c.effective_date)}</td>
                    <td className="px-3 py-2">{fmtDate(c.end_date)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.term_months ?? "—"} mo</td>
                    <td className="px-3 py-2 num">{fmtUSD(c.total_contract_value)}</td>
                    <td className="px-3 py-2 num">{c.has_minimum ? fmtUSD(c.minimum_amount) : "—"}</td>
                    <td className="px-3 py-2"><ContractStatus status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
