import { contexto, leerTodo } from "./datos";
import type { Deuda } from "./finanzas/analisis";
import { ordenRecomendado, type Prioridad } from "./finanzas/analisis";
import { estadoPrestamo, type EstadoPrestamo } from "./finanzas/prestamos";
import { estadoTarjeta, type EstadoTarjeta } from "./finanzas/tarjetas";
import { hoyISO, iso } from "./fechas";
import { num, type AbonoPrestamo, type Gasto, type Ingreso, type MovAhorro, type MovTarjeta, type Prestamo, type Tarjeta } from "./tipos";

type Ctx = Awaited<ReturnType<typeof contexto>>;

/** Préstamos y tarjetas con su estado actual (saldos, próxima cuota, utilización…). */
export async function cargarDeudas(ctx: Ctx, abonoMensualSimulado: Record<string, number> = {}) {
  const { supabase } = ctx;
  const [prestamos, abonos, tarjetas, movsTarjeta, enlazados] = await Promise.all([
    leerTodo<Prestamo>(supabase, "prestamos", undefined, { columna: "acreedor" }),
    leerTodo<AbonoPrestamo>(supabase, "prestamo_abonos", undefined, { columna: "fecha" }),
    leerTodo<Tarjeta>(supabase, "tarjetas", undefined, { columna: "nombre" }),
    leerTodo<MovTarjeta>(supabase, "tarjeta_movimientos", undefined, { columna: "fecha" }),
    // Sólo cuentan los pagos con fecha de hoy o anterior: un gasto fijo copiado
    // al mes siguiente no marca la cuota como pagada antes de tiempo.
    leerEnlazados(supabase),
  ]);

  const estadosPrestamos: EstadoPrestamo[] = prestamos.map((p) =>
    estadoPrestamo(
      p,
      enlazados.filter((g) => g.prestamo_id === p.id).map((g) => ({ fecha: g.fecha, monto: num(g.monto) })),
      abonos.filter((a) => a.prestamo_id === p.id).map((a) => ({ fecha: a.fecha, monto: num(a.monto) })),
      abonoMensualSimulado[p.id] ?? 0,
    ),
  );

  const tasa = num(ctx.hogar.tasa_cambio_usd);
  const estadosTarjetas: EstadoTarjeta[] = tarjetas.map((t) =>
    estadoTarjeta(
      t,
      movsTarjeta,
      enlazados.filter((g) => g.tarjeta_id === t.id).map((g) => ({ fecha: g.fecha, monto: num(g.monto) })),
      tasa,
      enlazados.filter((g) => g.pagado_con_tarjeta_id === t.id).map((g) => ({ fecha: g.fecha, monto: num(g.monto) })),
    ),
  );

  return { prestamos, estadosPrestamos, tarjetas, estadosTarjetas, abonos, movsTarjeta, gastosEnlazados: enlazados };
}

/**
 * Gastos enlazados a préstamos o tarjetas. Si la base aún no tiene la columna
 * pagado_con_tarjeta_id (migración 0003 sin ejecutar) se lee sin ella.
 */
async function leerEnlazados(supabase: Ctx["supabase"]): Promise<Gasto[]> {
  const hoy = hoyISO();
  try {
    return await leerTodo<Gasto>(
      supabase, "gastos",
      (q) => q.or("prestamo_id.not.is.null,tarjeta_id.not.is.null,pagado_con_tarjeta_id.not.is.null").lte("fecha", hoy),
      { columna: "fecha" },
    );
  } catch (e) {
    if (!String(e).includes("pagado_con_tarjeta_id")) throw e;
    return leerTodo<Gasto>(
      supabase, "gastos", (q) => q.or("prestamo_id.not.is.null,tarjeta_id.not.is.null").lte("fecha", hoy), { columna: "fecha" },
    );
  }
}

/** Préstamos activos y tarjetas con saldo, en RD$, en el formato del análisis de deudas. */
export function construirDeudas(estadosPrestamos: EstadoPrestamo[], estadosTarjetas: EstadoTarjeta[]): Deuda[] {
  return [
    ...estadosPrestamos
      .filter((e) => e.prestamo.activo && e.saldoActual > 0.5)
      .map((e) => ({
        id: e.prestamo.id,
        nombre: `${e.prestamo.acreedor} – ${e.prestamo.descripcion}`,
        tipo: "prestamo" as const,
        saldo: e.saldoActual,
        tasaAnual: num(e.prestamo.tasa_anual),
        pagoMinimo: num(e.prestamo.cuota_total),
        seguroMensual: num(e.prestamo.seguro_cuota),
        limite: null,
        penalidad: num(e.prestamo.penalidad_pago_anticipado),
      })),
    ...estadosTarjetas
      .filter((e) => e.tarjeta.activa && e.saldo > 0.5)
      .map((e) => ({
        id: e.tarjeta.id,
        nombre: e.tarjeta.nombre,
        tipo: "tarjeta" as const,
        saldo: e.saldo * e.aRD,
        tasaAnual: num(e.tarjeta.tasa_anual),
        pagoMinimo: e.pagoPlaneado * e.aRD,
        seguroMensual: 0,
        limite: e.limite > 0 ? e.limite * e.aRD : null,
        penalidad: 0,
      })),
  ];
}

/** Prioridad de cada deuda en el plan recomendado (sin dinero extra), por id. */
export function prioridadesDelPlan(estadosPrestamos: EstadoPrestamo[], estadosTarjetas: EstadoTarjeta[]) {
  const deudas = construirDeudas(estadosPrestamos, estadosTarjetas);
  const orden = ordenRecomendado(deudas, 0, { inicioDeMes: true });
  return { deudas, orden, porId: new Map<string, Prioridad>(orden.map((p) => [p.id, p])), total: orden.length };
}

/** Movimientos de un año completo. */
export async function cargarAnio(ctx: Ctx, anio: number) {
  const desde = iso(anio, 1, 1);
  const hasta = iso(anio, 12, 31);
  const rango = (q: { gte: (c: string, v: string) => { lte: (c: string, v: string) => unknown } }) =>
    q.gte("fecha", desde).lte("fecha", hasta);
  const [ingresos, gastos, ahorros] = await Promise.all([
    leerTodo<Ingreso>(ctx.supabase, "ingresos", rango, { columna: "fecha", asc: false }),
    leerTodo<Gasto>(ctx.supabase, "gastos", rango, { columna: "fecha", asc: false }),
    leerTodo<MovAhorro>(ctx.supabase, "ahorro_movimientos", rango, { columna: "fecha", asc: false }),
  ]);
  return { ingresos, gastos, ahorros };
}
