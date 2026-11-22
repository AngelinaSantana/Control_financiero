import { contexto, leerTodo } from "./datos";
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
    leerTodo<Pick<Gasto, "fecha" | "monto" | "prestamo_id" | "tarjeta_id">>(
      supabase, "gastos",
      (q) => q.or("prestamo_id.not.is.null,tarjeta_id.not.is.null").lte("fecha", hoyISO()),
      { columna: "fecha" },
    ),
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
    ),
  );

  return { prestamos, estadosPrestamos, tarjetas, estadosTarjetas, abonos, movsTarjeta };
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
