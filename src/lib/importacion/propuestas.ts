import { diasEntre, formatoFecha } from "../fechas";
import type { EstadoExtraido } from "./claude";

/** Qué se hará con cada fila del estado de cuenta. */
export type Accion =
  | "gasto"          // gasto pagado desde la cuenta bancaria / efectivo
  | "gasto_tarjeta"  // compra con tarjeta: gasto + sube la deuda
  | "pago_tarjeta"   // pago a una tarjeta: transferencia, baja la deuda
  | "cargo_tarjeta"  // interés / comisión: sube la deuda, no es gasto
  | "abono_tarjeta"  // devolución: baja la deuda, no es ingreso
  | "ingreso"
  | "cuota_prestamo" // gasto enlazado a un préstamo
  | "ignorar";

export const ETIQUETAS_ACCION: Record<Accion, string> = {
  gasto: "Gasto",
  gasto_tarjeta: "Compra con tarjeta",
  pago_tarjeta: "Pago a tarjeta",
  cargo_tarjeta: "Cargo / interés",
  abono_tarjeta: "Devolución a tarjeta",
  ingreso: "Ingreso",
  cuota_prestamo: "Cuota de préstamo",
  ignorar: "Ignorar",
};

export const ACCIONES_POR_ORIGEN: Record<"tarjeta" | "cuenta", Accion[]> = {
  tarjeta: ["gasto_tarjeta", "pago_tarjeta", "cargo_tarjeta", "abono_tarjeta", "ignorar"],
  cuenta: ["gasto", "ingreso", "pago_tarjeta", "cuota_prestamo", "ignorar"],
};

export interface FilaPropuesta {
  id: number;
  fecha: string;
  descripcion: string;   // tal como viene del banco
  concepto: string;      // limpio, editable
  monto: number;         // en la moneda de la transacción
  moneda: "DOP" | "USD";
  accion: Accion;
  categoria_id: string | null;
  tarjeta_id: string | null;
  prestamo_id: string | null;
  persona_id: string | null;
  duplicado: string | null;
  patron: string;
  origenSugerencia: "regla" | "claude" | "duplicado";
}

export interface ReglaImportacion {
  patron: string;
  accion: Accion;
  categoria_id: string | null;
  tarjeta_id: string | null;
  prestamo_id: string | null;
}

export interface Existente {
  fecha: string;
  montoRD: number;
  concepto: string;
}

export interface Contexto {
  origen: { tipo: "tarjeta"; id: string } | { tipo: "cuenta"; id: string };
  categorias: { id: string; nombre: string; tipo: "gasto" | "ingreso" }[];
  tarjetas: { id: string; nombre: string; moneda: "DOP" | "USD"; persona_id: string | null }[];
  prestamos: { id: string; acreedor: string; descripcion: string }[];
  reglas: ReglaImportacion[];
  existentes: Existente[];
  tasaCambio: number;
  miPersonaId: string | null;
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Clave del comercio para recordar reglas: "SUPERMERCADO NACIONAL 0023" → "SUPERMERCADO NACIONAL". */
export function patronDe(descripcion: string): string {
  return sinAcentos(descripcion.toUpperCase())
    .replace(/[^A-Z ]+/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1)
    .slice(0, 3)
    .join(" ");
}

/** "SUPERMERCADO NACIONAL 0023" → "Supermercado Nacional" */
export function conceptoDe(descripcion: string): string {
  const limpio = descripcion.replace(/[*#]+/g, " ").replace(/\s+\d[\d\s-]*$/, "").replace(/\s+/g, " ").trim();
  return (limpio || descripcion)
    .toLowerCase()
    .replace(/(^|[\s(/.-])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toUpperCase());
}

export const montoEnRD = (monto: number, moneda: "DOP" | "USD", tasa: number) =>
  Math.round((moneda === "USD" ? monto * (tasa || 1) : monto) * 100) / 100;

/** Tarjeta destino: la de origen si coincide la moneda; si no, la de esa moneda con nombre más parecido. */
function tarjetaParaMoneda(ctx: Contexto, moneda: "DOP" | "USD"): string | null {
  const origen = ctx.origen.tipo === "tarjeta" ? ctx.tarjetas.find((t) => t.id === ctx.origen.id) : undefined;
  if (origen && origen.moneda === moneda) return origen.id;
  const candidatas = ctx.tarjetas.filter((t) => t.moneda === moneda);
  if (!origen) return candidatas[0]?.id ?? null;
  const palabras = new Set(patronDe(origen.nombre).split(" "));
  const puntaje = (n: string) => patronDe(n).split(" ").filter((p) => palabras.has(p)).length;
  return [...candidatas].sort((a, b) => puntaje(b.nombre) - puntaje(a.nombre))[0]?.id ?? origen.id;
}

/** Busca un nombre de tarjeta o préstamo mencionado en la descripción. */
function buscarPorNombre<T extends { id: string }>(desc: string, lista: T[], nombres: (x: T) => string): string | null {
  const d = patronDe(desc);
  for (const x of lista) {
    const claves = patronDe(nombres(x)).split(" ").filter((p) => p.length > 2 && !["TARJETA", "CREDITO", "PRESTAMO", "PESOS"].includes(p));
    if (claves.some((c) => d.includes(c))) return x.id;
  }
  return null;
}

export function construirPropuestas(estado: EstadoExtraido, ctx: Contexto): FilaPropuesta[] {
  const catGasto = ctx.categorias.filter((c) => c.tipo === "gasto");
  const catIngreso = ctx.categorias.filter((c) => c.tipo === "ingreso");
  const idCat = (nombre: string | null, lista: typeof catGasto) =>
    nombre ? lista.find((c) => sinAcentos(c.nombre.toLowerCase()) === sinAcentos(nombre.toLowerCase()))?.id ?? null : null;
  const reglas = new Map(ctx.reglas.map((r) => [r.patron, r]));
  const usados = new Set<number>();
  const origenTarjeta = ctx.origen.tipo === "tarjeta" ? ctx.tarjetas.find((t) => t.id === ctx.origen.id) : undefined;
  const personaPorDefecto = origenTarjeta?.persona_id ?? ctx.miPersonaId;

  return estado.movimientos.map((m, id) => {
    const patron = patronDe(m.descripcion);
    const fila: FilaPropuesta = {
      id,
      fecha: m.fecha,
      descripcion: m.descripcion,
      concepto: conceptoDe(m.descripcion),
      monto: Math.abs(m.monto),
      moneda: m.moneda,
      accion: "ignorar",
      categoria_id: null,
      tarjeta_id: null,
      prestamo_id: null,
      persona_id: personaPorDefecto,
      duplicado: null,
      patron,
      origenSugerencia: "claude",
    };

    // 1) Sugerencia según el tipo que detectó Claude
    if (ctx.origen.tipo === "tarjeta") {
      fila.tarjeta_id = tarjetaParaMoneda(ctx, m.moneda);
      if (m.tipo === "pago_tarjeta") fila.accion = "pago_tarjeta";
      else if (m.tipo === "interes_comision") fila.accion = "cargo_tarjeta";
      else if (m.sentido === "credito") fila.accion = "abono_tarjeta";
      else {
        fila.accion = "gasto_tarjeta";
        fila.categoria_id = idCat(m.categoria, catGasto);
      }
    } else if (m.sentido === "credito") {
      fila.accion = m.tipo === "transferencia" ? "ignorar" : "ingreso";
      fila.categoria_id = fila.accion === "ingreso" ? idCat(m.categoria, catIngreso) : null;
    } else if (m.tipo === "pago_tarjeta") {
      fila.accion = "pago_tarjeta";
      fila.tarjeta_id = buscarPorNombre(m.descripcion, ctx.tarjetas, (t) => t.nombre) ?? ctx.tarjetas[0]?.id ?? null;
    } else if (m.tipo === "cuota_prestamo") {
      fila.accion = "cuota_prestamo";
      fila.prestamo_id = buscarPorNombre(m.descripcion, ctx.prestamos, (p) => `${p.acreedor} ${p.descripcion}`);
    } else if (m.tipo === "transferencia") {
      fila.accion = "ignorar";
    } else {
      fila.accion = "gasto";
      fila.categoria_id = idCat(m.categoria, catGasto);
    }

    // 2) Una regla aprendida del mismo comercio manda sobre la sugerencia
    const regla = reglas.get(patron);
    if (regla && ACCIONES_POR_ORIGEN[ctx.origen.tipo].includes(regla.accion)) {
      fila.accion = regla.accion;
      fila.categoria_id = regla.categoria_id;
      if (regla.prestamo_id) fila.prestamo_id = regla.prestamo_id;
      if (regla.tarjeta_id && regla.accion === "pago_tarjeta" && ctx.origen.tipo === "cuenta") fila.tarjeta_id = regla.tarjeta_id;
      fila.origenSugerencia = "regla";
    }

    // 3) ¿Ya está registrado? (mismo monto en RD$ y fecha a ±3 días)
    const rd = montoEnRD(fila.monto, fila.moneda, ctx.tasaCambio);
    const i = ctx.existentes.findIndex(
      (e, k) => !usados.has(k) && Math.abs(e.montoRD - rd) < 0.02 && Math.abs(diasEntre(e.fecha, m.fecha)) <= 3,
    );
    if (i >= 0) {
      usados.add(i);
      fila.duplicado = `Ya registrado: ${ctx.existentes[i].concepto} (${formatoFecha(ctx.existentes[i].fecha)})`;
      fila.accion = "ignorar";
      fila.origenSugerencia = "duplicado";
    }
    return fila;
  });
}
