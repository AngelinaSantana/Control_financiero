const rd = new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("es-DO", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function dinero(n: number, moneda: "DOP" | "USD" = "DOP"): string {
  const s = rd.format(Math.abs(n));
  const signo = n < 0 ? "-" : "";
  return `${signo}${moneda === "USD" ? "US$" : "RD$"}${s}`;
}

export function numero(n: number): string {
  return rd.format(n);
}

export function porcentaje(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return pct.format(n);
}
