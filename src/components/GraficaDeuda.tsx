"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface PuntoDeuda { etiqueta: string; actual: number | null; plan: number | null }

const fmt = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 0 });
const compacto = new Intl.NumberFormat("es-DO", { notation: "compact", maximumFractionDigits: 1 });

/** Deuda total en el tiempo: serie 1 (azul) = como vas ahora, serie 2 (naranja) = con el plan. */
export function GraficaDeuda({ datos, nombrePlan }: { datos: PuntoDeuda[]; nombrePlan: string }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Deuda total en el tiempo, ritmo actual contra el plan">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--borde)" />
          <XAxis dataKey="etiqueta" tickLine={false} axisLine={{ stroke: "var(--borde)" }} tick={{ fill: "var(--tenue)", fontSize: 12 }} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={52} tick={{ fill: "var(--tenue)", fontSize: 12 }} tickFormatter={(v) => compacto.format(v)} />
          <Tooltip
            contentStyle={{ background: "var(--superficie)", border: "1px solid var(--borde)", borderRadius: 8, color: "var(--texto)", fontSize: 13 }}
            formatter={(v, nombre) => [v === null ? "—" : `RD$${fmt.format(Number(v))}`, nombre]}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 13, color: "var(--tenue)" }} />
          <Line type="monotone" dataKey="actual" name="Como vas ahora" stroke="var(--serie-1)" strokeWidth={2} dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="plan" name={nombrePlan} stroke="var(--serie-2)" strokeWidth={2} dot={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
