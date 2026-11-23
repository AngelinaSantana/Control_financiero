import { num, type ConceptoPresupuesto, type Gasto } from "./tipos";

/**
 * ¿Un gasto ya tiene su concepto en el presupuesto?
 * Se comparan las palabras importantes del nombre: "Casa" coincide con
 * "Casa (Alquiler)", "1era parte Vehiculo" con "Pago del vehículo",
 * pero "Telefono F" NO coincide con "Teléfono A".
 */

const VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "en", "por", "para", "con", "al",
  "pago", "pagos", "cuota", "cuotas", "mensual", "quincena", "quincenal", "parte", "mes", "abono",
]);

export function palabrasClave(nombre: string): Set<string> {
  return new Set(
    nombre
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[()[\].,;:/\\#*_-]+/g, " ")
      .split(/\s+/)
      .filter((p) => p && !VACIAS.has(p) && !/\d/.test(p)),
  );
}

/** Coinciden si todas las palabras clave del nombre más corto están en el otro. */
export function coincideNombre(a: string, b: string): boolean {
  const pa = palabrasClave(a), pb = palabrasClave(b);
  if (pa.size === 0 || pb.size === 0) return false;
  const [menor, mayor] = pa.size <= pb.size ? [pa, pb] : [pb, pa];
  return [...menor].every((p) => mayor.has(p));
}

export function conceptoCoincidente<T extends Pick<ConceptoPresupuesto, "concepto">>(nombreGasto: string, conceptos: T[]): T | undefined {
  return conceptos.find((c) => coincideNombre(nombreGasto, c.concepto));
}

/**
 * Gastos que deberían estar en el presupuesto: los marcados como Fijo, salvo
 * cuotas de préstamo y pagos a tarjeta (ya se planifican en sus categorías de deuda).
 */
export const esFijoPresupuestable = (g: Pick<Gasto, "tipo" | "prestamo_id" | "tarjeta_id">) =>
  g.tipo === "Fijo" && !g.prestamo_id && !g.tarjeta_id;

export interface FijoSinPresupuesto {
  clave: string;
  concepto: string;
  categoria_id: string | null;
  persona_id: string | null;
  quincena: Gasto["quincena"];
  cuenta_id: string | null;
  monto: number;     // el más reciente
  fecha: string;     // la más reciente
  veces: number;     // cuántas veces aparece en el período
}

/** Agrupa los gastos fijos que no coinciden con ningún concepto del presupuesto. */
export function fijosSinPresupuesto(gastos: Gasto[], conceptos: Pick<ConceptoPresupuesto, "concepto">[]): FijoSinPresupuesto[] {
  const grupos = new Map<string, FijoSinPresupuesto>();
  for (const g of [...gastos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (!esFijoPresupuestable(g) || conceptoCoincidente(g.concepto, conceptos)) continue;
    const clave = [...palabrasClave(g.concepto)].sort().join(" ") || g.concepto.toLowerCase();
    const previo = grupos.get(clave);
    grupos.set(clave, {
      clave,
      concepto: g.concepto,
      categoria_id: g.categoria_id ?? previo?.categoria_id ?? null,
      persona_id: g.persona_id,
      quincena: g.quincena,
      cuenta_id: g.cuenta_id,
      monto: num(g.monto),
      fecha: g.fecha,
      veces: (previo?.veces ?? 0) + 1,
    });
  }
  return [...grupos.values()].sort((a, b) => b.monto - a.monto);
}

export type EstadoCategoria = "bien" | "cerca" | "excedido" | "sin_presupuesto" | "sin_gasto";

export function estadoCategoria(planeado: number, real: number): EstadoCategoria {
  if (real <= 0) return "sin_gasto";
  if (planeado <= 0) return "sin_presupuesto";
  const uso = real / planeado;
  if (uso > 1.0001) return "excedido";
  if (uso >= 0.85) return "cerca";
  return "bien";
}
