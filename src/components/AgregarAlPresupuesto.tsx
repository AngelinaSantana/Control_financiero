import Link from "next/link";
import { guardarConcepto } from "@/app/acciones";
import { MESES } from "@/lib/fechas";
import type { Categoria, Quincena } from "@/lib/tipos";

export interface FijoParaAgregar {
  concepto: string;
  categoria_id: string | null;
  persona_id: string | null;
  quincena: Quincena;
  cuenta_id: string | null;
  monto: number;
}

const campo = "rounded-lg border border-borde bg-superficie px-2 py-1.5 text-sm";

/**
 * Agrega un gasto fijo al presupuesto como concepto nuevo, con el mismo monto
 * desde el mes elegido hasta diciembre. Usa la acción guardarConcepto.
 */
export function AgregarAlPresupuesto({ item, anio, desdeMes, categorias, volver, cancelar }: {
  item: FijoParaAgregar;
  anio: number;
  desdeMes: number;
  categorias: Categoria[];
  volver: string;
  cancelar?: string;
}) {
  return (
    <form action={guardarConcepto} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="volver" value={volver} />
      <input type="hidden" name="anio" value={anio} />
      <input type="hidden" name="tipo" value="Fijo" />
      <input type="hidden" name="persona_id" value={item.persona_id ?? ""} />
      <input type="hidden" name="quincena" value={item.quincena} />
      <input type="hidden" name="cuenta_id" value={item.cuenta_id ?? ""} />
      <label className="flex min-w-40 flex-1 flex-col gap-0.5 text-xs text-tenue">
        Concepto
        <input name="concepto" required defaultValue={item.concepto} className={campo} />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-tenue">
        Categoría
        <select name="categoria_id" required defaultValue={item.categoria_id ?? ""} className={campo}>
          <option value="" disabled>Elige…</option>
          {categorias.filter((c) => c.tipo === "gasto").map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </label>
      <label className="flex w-28 flex-col gap-0.5 text-xs text-tenue">
        Monto al mes
        <input name="monto" required inputMode="decimal" defaultValue={item.monto.toFixed(2)} className={`${campo} text-right tabular-nums`} />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-tenue">
        Desde
        <select name="desde_mes" defaultValue={String(desdeMes)} className={campo}>
          {MESES.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
        </select>
      </label>
      <button className="rounded-lg bg-marca px-3 py-1.5 text-sm font-semibold text-white hover:bg-marca-oscuro">Agregar al presupuesto</button>
      {cancelar && <Link href={cancelar} className="px-2 py-1.5 text-sm text-tenue hover:underline">Ahora no</Link>}
    </form>
  );
}
