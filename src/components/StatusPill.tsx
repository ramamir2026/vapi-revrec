import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClasses: Record<Tone, string> = {
  success: "text-[hsl(var(--status-success))] bg-[hsl(var(--status-success-bg))] ring-[hsl(var(--status-success)/0.2)]",
  warning: "text-[hsl(var(--status-warning))] bg-[hsl(var(--status-warning-bg))] ring-[hsl(var(--status-warning)/0.2)]",
  danger: "text-[hsl(var(--status-danger))] bg-[hsl(var(--status-danger-bg))] ring-[hsl(var(--status-danger)/0.2)]",
  info: "text-[hsl(var(--status-info))] bg-[hsl(var(--status-info-bg))] ring-[hsl(var(--status-info)/0.2)]",
  neutral: "text-[hsl(var(--status-neutral))] bg-[hsl(var(--status-neutral-bg))] ring-[hsl(var(--status-neutral)/0.2)]",
};

export function StatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-[11px] font-medium rounded ring-1 ring-inset",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

const customerStatus: Record<string, Tone> = {
  active: "success",
  paused: "warning",
  churned: "danger",
  renewal_pending: "info",
};
const contractStatus: Record<string, Tone> = {
  active: "success",
  terminated: "neutral",
  amended: "info",
  superseded: "neutral",
};
const jeStatus: Record<string, Tone> = {
  draft: "neutral",
  posted: "success",
  exported: "info",
  reversed: "warning",
};
const scheduleStatus: Record<string, Tone> = {
  forecast: "neutral",
  actual_posted: "success",
  reversed: "warning",
};

export function CustomerStatus({ status }: { status: string }) {
  return <StatusPill tone={customerStatus[status] ?? "neutral"}>{status}</StatusPill>;
}
export function ContractStatus({ status }: { status: string }) {
  return <StatusPill tone={contractStatus[status] ?? "neutral"}>{status}</StatusPill>;
}
export function JEStatus({ status }: { status: string }) {
  return <StatusPill tone={jeStatus[status] ?? "neutral"}>{status}</StatusPill>;
}
export function ScheduleStatus({ status }: { status: string }) {
  return <StatusPill tone={scheduleStatus[status] ?? "neutral"}>{status.replace("_", " ")}</StatusPill>;
}
