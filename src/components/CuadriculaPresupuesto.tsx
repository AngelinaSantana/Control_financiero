"use client";

import { useMemo, useState, useTransition } from "react";
import { guardarMonto } from "@/app/acciones";
import { MESES_CORTOS } from "@/lib/fechas";

export interface FilaCuadricula {
  id: string;
  concepto: string;
  categoria: string;
  detalle: string;
  montos: number[]; // 12
}

const fmt = new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CuadriculaPresupuesto({ anio, filas, real }: { anio: number; filas: FilaCuadricula[]; real: number[] }) {
  const [datos, setDatos] = useState(() => Object.fromEntries(filas.map((f) => [f.id, f.montos])));
  const [estado, setEstado] = useState<Record<string, "guardando" | "error" | undefined>>({});
  const [, startTransition] = useTransition();

  const totales = useMemo(
    () => Array.from({ length: 12 }, (_, m) => filas.reduce((s, f) => s + (datos[f.id]?.[m] ?? 0), 0)),
    [datos, filas],
  );

  function cambiar(id: string, mes: number, texto: string) {
    const v = Number(texto.replace(/,/g, "")) || 0;
    if ((datos[id]?.[mes] ?? 0) === v) return;
    setDatos((d) => ({ ...d, [id]: d[id].map((x, i) => (i === mes ? v : x)) }));
    const clave = `${id}-${mes}`;
    setEstado((e) => ({ ...e, [clave]: "guardando" }));
    startTransition(async () => {
      const r = await guardarMonto(id, anio, mes + 1, v);
      setEstado((e) => ({ ...e, [clave]: r.error ? "error" : undefined }));
    });
  }

  let categoriaPrevia = "";
  return (
    <div className="desplazable">
      <table className="tabla min-w-[1100px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-[1] bg-superficie">Concepto</th>
            {MESES_CORTOS.map((m) => <th key={m} className="num">{m}</th>)}
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const cabecera = f.categoria !== categoriaPrevia;
            categoriaPrevia = f.categoria;
            const fila = datos[f.id];
            return [
              cabecera && (
                <tr key={`c-${f.categoria}`}>
                  <td colSpan={14} className="bg-fondo text-xs font-bold uppercase tracking-wide text-tenue">{f.categoria}</td>
                </tr>
              ),
              <tr key={f.id}>
                <td className="sticky left-0 z-[1] bg-superficie">
                  <div className="font-medium">{f.concepto}</div>
                  <div className="text-xs text-tenue">{f.detalle}</div>
                </td>
                {fila.map((v, m) => {
                  const st = estado[`${f.id}-${m}`];
                  return (
                    <td key={m} className="num p-1">
                      <input
                        aria-label={`${f.concepto} ${MESES_CORTOS[m]}`}
                        defaultValue={v ? v.toFixed(2) : ""}
                        inputMode="decimal"
                        onBlur={(e) => cambiar(f.id, m, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className={`w-24 rounded-md border bg-transparent px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-marca ${st === "error" ? "border-malo" : st === "guardando" ? "border-aviso" : "border-transparent hover:border-borde"}`}
                      />
                    </td>
                  );
                })}
                <td className="num font-semibold">{fmt.format(fila.reduce((a, b) => a + b, 0))}</td>
              </tr>,
            ];
          })}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td className="sticky left-0 z-[1] bg-superficie">Total planeado</td>
            {totales.map((t, i) => <td key={i} className="num">{fmt.format(t)}</td>)}
            <td className="num">{fmt.format(totales.reduce((a, b) => a + b, 0))}</td>
          </tr>
          <tr className="text-tenue">
            <td className="sticky left-0 z-[1] bg-superficie">Gasto real</td>
            {real.map((t, i) => <td key={i} className="num">{fmt.format(t)}</td>)}
            <td className="num">{fmt.format(real.reduce((a, b) => a + b, 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
