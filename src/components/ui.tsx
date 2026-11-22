import Link from "next/link";
import type { ReactNode } from "react";
import { MESES } from "@/lib/fechas";

export const claseInput =
  "w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm text-texto outline-none focus:border-marca focus:ring-2 focus:ring-marca/20";
export const claseBoton =
  "inline-flex items-center justify-center gap-1 rounded-lg bg-marca px-4 py-2 text-sm font-semibold text-white hover:bg-marca-oscuro disabled:opacity-50";
export const claseBotonSec =
  "inline-flex items-center justify-center gap-1 rounded-lg border border-borde bg-superficie px-3 py-2 text-sm font-medium text-texto hover:bg-fondo";

export function Encabezado({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-tenue">{subtitulo}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Panel({ titulo, children, accion, className = "" }: { titulo?: string; children: ReactNode; accion?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-borde bg-superficie p-4 shadow-sm sm:p-5 ${className}`}>
      {(titulo || accion) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {titulo && <h2 className="text-base font-semibold">{titulo}</h2>}
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

export function Dato({ etiqueta, valor, detalle, tono = "normal" }: {
  etiqueta: string; valor: string; detalle?: string; tono?: "normal" | "bueno" | "malo" | "aviso";
}) {
  const color = { normal: "text-texto", bueno: "text-bueno", malo: "text-malo", aviso: "text-aviso" }[tono];
  return (
    <div className="rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-tenue">{etiqueta}</div>
      <div className={`mt-1 break-words text-lg font-bold tabular-nums sm:text-xl ${color}`}>{valor}</div>
      {detalle && <div className="mt-1 text-xs text-tenue">{detalle}</div>}
    </div>
  );
}

export function Campo({ etiqueta, children, className = "" }: { etiqueta: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="font-medium text-tenue">{etiqueta}</span>
      {children}
    </label>
  );
}

export function Seleccion({ name, opciones, valor, vacio, required }: {
  name: string; opciones: { valor: string; etiqueta: string }[]; valor?: string | null; vacio?: string; required?: boolean;
}) {
  return (
    <select name={name} defaultValue={valor ?? ""} className={claseInput} required={required}>
      {vacio !== undefined && <option value="">{vacio}</option>}
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
      ))}
    </select>
  );
}

export function Mensajes({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return (
    <div
      role="status"
      className={`mb-4 rounded-xl border px-4 py-3 text-sm ${error ? "border-malo/30 bg-malo/10 text-malo" : "border-bueno/30 bg-bueno/10 text-bueno"}`}
    >
      {error ?? ok}
    </div>
  );
}

export function Insignia({ children, tono = "normal" }: { children: ReactNode; tono?: "normal" | "bueno" | "malo" | "aviso" }) {
  const c = {
    normal: "bg-fondo text-tenue",
    bueno: "bg-bueno/10 text-bueno",
    malo: "bg-malo/10 text-malo",
    aviso: "bg-aviso/15 text-aviso",
  }[tono];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${c}`}>{children}</span>;
}

export function Barra({ valor, tono = "marca" }: { valor: number; tono?: "marca" | "bueno" | "malo" | "aviso" }) {
  const v = Math.max(0, Math.min(valor, 1));
  const c = { marca: "bg-marca", bueno: "bg-bueno", malo: "bg-malo", aviso: "bg-aviso" }[tono];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-fondo">
      <div className={`h-full rounded-full ${c}`} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

/** Navegación entre meses con ?mes=YYYY-MM */
export function SelectorMes({ ruta, anio, mes, extra = "" }: { ruta: string; anio: number; mes: number; extra?: string }) {
  const ant = mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, "0")}`;
  const sig = mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, "0")}`;
  return (
    <div className="inline-flex items-center rounded-lg border border-borde bg-superficie">
      <Link href={`${ruta}?mes=${ant}${extra}`} className="px-3 py-2 text-sm hover:bg-fondo" aria-label="Mes anterior">‹</Link>
      <span className="min-w-32 px-2 text-center text-sm font-semibold">{MESES[mes - 1]} {anio}</span>
      <Link href={`${ruta}?mes=${sig}${extra}`} className="px-3 py-2 text-sm hover:bg-fondo" aria-label="Mes siguiente">›</Link>
    </div>
  );
}

export function leerMes(param: string | undefined, porDefecto: Date = new Date()): [number, number] {
  const m = /^(\d{4})-(\d{2})$/.exec(param ?? "");
  if (m) return [Number(m[1]), Math.min(Math.max(Number(m[2]), 1), 12)];
  return [porDefecto.getFullYear(), porDefecto.getMonth() + 1];
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-tenue">{children}</p>;
}
