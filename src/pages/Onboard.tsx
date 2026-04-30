import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCanWrite } from "@/lib/auth";
import { AppLayout, PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function Onboard() {
  useEffect(() => { document.title = "Onboard customer · Vapi RevRec"; }, []);
  const navigate = useNavigate();
  const canWrite = useCanWrite();
  const { user } = useAuth();

  const [legalName, setLegalName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerIdEdited, setCustomerIdEdited] = useState(false);
  const [domain, setDomain] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [msaFile, setMsaFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canWrite) {
    return (
      <AppLayout>
        <PageHeader title="Onboard customer" />
        <div className="px-6 py-6">
          <Alert variant="destructive"><AlertDescription>You need accountant or admin role to onboard customers.</AlertDescription></Alert>
        </div>
      </AppLayout>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!msaFile) { setError("Upload the MSA PDF."); return; }
    if (!msaFile.name.toLowerCase().endsWith(".pdf")) { setError("MSA must be a PDF."); return; }

    const slug = customerId || slugify(legalName);
    if (!slug) { setError("Customer ID required."); return; }

    setBusy(true);
    try {
      // 1. Create customer
      const { data: customer, error: custErr } = await supabase
        .from("customers")
        .insert({
          customer_id: slug,
          legal_name: legalName,
          domain: domain || null,
          primary_contact_email: contactEmail || null,
          status: "active",
          created_by: user?.id,
        })
        .select()
        .single();
      if (custErr) throw custErr;

      // 2. Upload MSA
      const path = `${slug}/MSA.pdf`;
      const { error: upErr } = await supabase.storage.from("msas").upload(path, msaFile, { upsert: true, contentType: "application/pdf" });
      if (upErr) throw upErr;

      // 3. Create contract
      const { data: contract, error: contractErr } = await supabase
        .from("contracts")
        .insert({
          customer_pk: customer.id,
          msa_storage_path: path,
          effective_date: effectiveDate,
          end_date: endDate,
          status: "active",
          created_by: user?.id,
        })
        .select()
        .single();
      if (contractErr) throw contractErr;

      // 4. Audit (UI-side: customer/contract created)
      // (audit_log writes from UI are read-only; the spec writes these from edge funcs.
      // We skip and let analyze-msa handle the analysis_run audit.)

      toast.success("Customer onboarded. Run analysis to extract contract terms.");
      navigate(`/customers/${slug}?contract=${contract.id}&analyze=1`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title="Onboard customer" description="Create a customer, upload the MSA, and run ASC 606 analysis." />
      <form onSubmit={handleSubmit} className="px-6 py-6 max-w-2xl space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Legal name" required>
            <Input value={legalName} onChange={(e) => {
              setLegalName(e.target.value);
              if (!customerIdEdited) setCustomerId(slugify(e.target.value));
            }} required />
          </Field>
          <Field label="Customer ID (slug)" required>
            <Input value={customerId} onChange={(e) => { setCustomerId(slugify(e.target.value)); setCustomerIdEdited(true); }} required pattern="[a-z0-9-]+" />
          </Field>
          <Field label="Domain">
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" />
          </Field>
          <Field label="Primary contact">
            <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="ap@example.com" />
          </Field>
          <Field label="Effective date" required>
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required />
          </Field>
          <Field label="End date" required>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </Field>
        </div>
        <Field label="MSA (PDF)" required>
          <Input type="file" accept="application/pdf" onChange={(e) => setMsaFile(e.target.files?.[0] ?? null)} required />
        </Field>
        {error ? <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate("/customers")}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create and continue"}</Button>
        </div>
      </form>
    </AppLayout>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}{required ? <span className="text-destructive ml-0.5">*</span> : null}</Label>
      {children}
    </div>
  );
}
