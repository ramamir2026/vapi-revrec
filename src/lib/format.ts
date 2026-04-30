export function fmtUSD(n: number | null | undefined, opts: { precise?: boolean } = {}) {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  const value = Number(n);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.precise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

export function fmtPeriod(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function fmtNumber(n: number | null | undefined, digits = 0) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(n));
}
