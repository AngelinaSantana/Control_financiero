"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface PuntoMensual { mes: string; ingresos: number; gastos: number }

const fmt = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 0 });
const compacto = new Intl.NumberFormat("es-DO", { notation: "compact", maximumFractionDigits: 1 });

/** Ingresos vs. gastos por mes. Serie 1 (azul) = ingresos, serie 2 (naranja) = gastos. */
export function GraficaMensual({ datos }: { datos: PuntoMensual[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Ingresos y gastos por mes">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--borde)" strokeDasharray="0" />
          <XAxis dataKey="mes" tickLine={false} axisLine={{ stroke: "var(--borde)" }} tick={{ fill: "var(--tenue)", fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: "var(--tenue)", fontSize: 12 }} tickFormatter={(v) => compacto.format(v)} />
          <Tooltip
            cursor={{ fill: "var(--fondo)" }}
            contentStyle={{ background: "var(--superficie)", border: "1px solid var(--borde)", borderRadius: 8, color: "var(--texto)", fontSize: 13 }}
            formatter={(v, nombre) => [`RD$${fmt.format(Number(v))}`, nombre]}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 13, color: "var(--tenue)" }} />
          <Bar dataKey="ingresos" name="Ingresos" fill="var(--serie-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="gastos" name="Gastos" fill="var(--serie-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
