"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { guardarMonto } from "@/app/acciones";
import { MESES_CORTOS } from "@/lib/fechas";

export interface FilaCuadricula {
  id: string;
  concepto: string;
  categoria: string;
  detalle: string;
  montos: number[]; // 12
}

const fmt = new Intl.NumberFormat("es-DO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Cuadrícula concepto × mes. Cada celda se guarda al salir de ella (o con Enter).
 * Resalta el mes que se está viendo y muestra el subtotal de cada categoría.
 */
export function CuadriculaPresupuesto({ anio, filas, real, mesResaltado, editarBase }: {
  anio: number;
  filas: FilaCuadricula[];
  real: number[];
  mesResaltado: number | null;
  /** URL de la página; el enlace de edición agrega &editar=id */
  editarBase: string;
}) {
  const [datos, setDatos] = useState(() => Object.fromEntries(filas.map((f) => [f.id, f.montos])));
  const [estado, setEstado] = useState<Record<string, "guardando" | "error" | undefined>>({});
  const [, startTransition] = useTransition();
  const contenedor = useRef<HTMLDivElement>(null);

  // Al abrir, desplazar la tabla hasta el mes que se está viendo
  useEffect(() => {
    const caja = contenedor.current;
    const th = caja?.querySelector<HTMLElement>(`th[data-mes="${mesResaltado}"]`);
    const primera = caja?.querySelector<HTMLElement>("th");
    if (caja && th && primera) caja.scrollLeft = Math.max(th.offsetLeft - primera.offsetWidth - 120, 0);
  }, [mesResaltado]);

  const grupos = useMemo(() => {
    const m = new Map<string, FilaCuadricula[]>();
    for (const f of filas) m.set(f.categoria, [...(m.get(f.categoria) ?? []), f]);
    return [...m.entries()];
  }, [filas]);
  const sumar = (ids: string[], mes: number) => ids.reduce((s, id) => s + (datos[id]?.[mes] ?? 0), 0);
  const totales = Array.from({ length: 12 }, (_, m) => sumar(filas.map((f) => f.id), m));

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

  const col = (m: number) => (mesResaltado === m + 1 ? "bg-marca/10" : "");

  return (
    <div ref={contenedor} className="desplazable max-h-[70vh] overflow-y-auto rounded-xl border border-borde">
      <table className="tabla min-w-[1150px]">
        <thead className="sticky top-0 z-[2]">
          <tr className="[&>th]:bg-superficie">
            <th className="sticky left-0 z-[3] min-w-56 bg-superficie">Concepto</th>
            {MESES_CORTOS.map((m, i) => (
              <th key={m} data-mes={i + 1} className={`num ${mesResaltado === i + 1 ? "!bg-marca !text-white" : ""}`}>{m}</th>
            ))}
            <th className="num">Total año</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map(([categoria, items]) => (
            <Fragment key={categoria}>
              <tr>
                <td className="sticky left-0 z-[1] bg-fondo text-xs font-bold uppercase tracking-wide text-tenue">{categoria}</td>
                {MESES_CORTOS.map((m, i) => (
                  <td key={m} className={`num bg-fondo text-xs font-semibold text-tenue ${col(i)}`}>
                    {sumar(items.map((f) => f.id), i) ? fmt.format(sumar(items.map((f) => f.id), i)) : ""}
                  </td>
                ))}
                <td className="num bg-fondo text-xs font-semibold text-tenue">
                  {fmt.format(Array.from({ length: 12 }, (_, i) => sumar(items.map((f) => f.id), i)).reduce((a, b) => a + b, 0))}
                </td>
              </tr>
              {items.map((f) => {
                const fila = datos[f.id];
                return (
                  <tr key={f.id}>
                    <td className="sticky left-0 z-[1] bg-superficie">
                      <Link href={`${editarBase}&editar=${f.id}#concepto`} className="font-medium hover:text-marca hover:underline" title="Editar concepto">{f.concepto}</Link>
                      <div className="text-xs text-tenue">{f.detalle}</div>
                    </td>
                    {fila.map((v, m) => {
                      const st = estado[`${f.id}-${m}`];
                      return (
                        <td key={m} className={`num p-1 ${col(m)}`}>
                          <input
                            aria-label={`${f.concepto} ${MESES_CORTOS[m]}`}
                            defaultValue={v ? v.toFixed(2) : ""}
                            placeholder="—"
                            inputMode="decimal"
                            onBlur={(e) => cambiar(f.id, m, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            className={`w-24 rounded-md border bg-transparent px-2 py-1 text-right text-sm tabular-nums outline-none placeholder:text-borde focus:border-marca focus:bg-superficie ${st === "error" ? "border-malo" : st === "guardando" ? "border-aviso" : "border-transparent hover:border-borde"}`}
                          />
                        </td>
                      );
                    })}
                    <td className="num font-semibold">{fmt.format(fila.reduce((a, b) => a + b, 0))}</td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-borde">
          <tr className="font-bold [&>td]:bg-superficie">
            <td className="sticky left-0 z-[3] bg-superficie">Total planeado</td>
            {totales.map((t, i) => <td key={i} className={`num ${col(i)}`}>{fmt.format(t)}</td>)}
            <td className="num">{fmt2.format(totales.reduce((a, b) => a + b, 0))}</td>
          </tr>
          <tr className="text-tenue [&>td]:bg-superficie">
            <td className="sticky left-0 z-[3] bg-superficie">Gastado de verdad</td>
            {real.map((t, i) => (
              <td key={i} className={`num ${col(i)} ${t > totales[i] && totales[i] > 0 ? "text-malo" : ""}`}>{t ? fmt.format(t) : "—"}</td>
            ))}
            <td className="num">{fmt2.format(real.reduce((a, b) => a + b, 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
