import { NOMBRES_PASO, type Prioridad } from "@/lib/finanzas/analisis";

const COLOR: Record<Prioridad["paso"], string> = {
  1: "bg-malo/10 text-malo",
  2: "bg-bueno/10 text-bueno",
  3: "bg-marca/10 text-marca",
  4: "bg-fondo text-tenue",
};

/** Puesto de una deuda en el plan recomendado: "#2 de 15 · Saldar ya", con el motivo al pasar el cursor. */
export function PrioridadPlan({ p, total }: { p: Prioridad | undefined; total: number }) {
  if (!p) return <span className="text-tenue">—</span>;
  return (
    <span title={p.motivo} className="inline-flex flex-col items-start gap-0.5">
      <span className="font-bold tabular-nums">#{p.puesto} <span className="text-xs font-normal text-tenue">de {total}</span></span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${COLOR[p.paso]}`}>{NOMBRES_PASO[p.paso]}</span>
    </span>
  );
}
