import { AnalisisDeudas } from "@/components/AnalisisDeudas";
import { Encabezado } from "@/components/ui";
import { cargarAnio, cargarDeudas } from "@/lib/cargas";
import { contexto, leerTodo } from "@/lib/datos";
import { hoyISO } from "@/lib/fechas";
import type { Deuda } from "@/lib/finanzas/analisis";
import { resumenAnual, saldosAhorro } from "@/lib/finanzas/resumen";
import { num, type FondoAhorro, type MovAhorro } from "@/lib/tipos";

export default async function Analisis() {
  const ctx = await contexto();
  const { supabase, hogar, categorias } = ctx;
  const hoy = hoyISO();
  const anio = Number(hoy.slice(0, 4));

  const [{ estadosPrestamos, estadosTarjetas }, actual, anterior, fondos, movsAhorro] = await Promise.all([
    cargarDeudas(ctx),
    cargarAnio(ctx, anio),
    cargarAnio(ctx, anio - 1),
    leerTodo<FondoAhorro>(supabase, "fondos_ahorro", undefined, { columna: "orden" }),
    leerTodo<MovAhorro>(supabase, "ahorro_movimientos"),
  ]);

  const deudas: Deuda[] = [
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

  // Ingreso y gasto de referencia: promedio de los últimos 3 meses con ingresos registrados
  const meses = [
    ...resumenAnual(anio - 1, anterior.ingresos, anterior.gastos, anterior.ahorros, categorias).meses,
    ...resumenAnual(anio, actual.ingresos, actual.gastos, actual.ahorros, categorias).meses,
  ].filter((m) => m.ingresos > 0).slice(-3);
  const ingresoMensual = meses.length ? meses.reduce((s, m) => s + m.ingresos, 0) / meses.length : 0;
  const gastoMensual = meses.length ? meses.reduce((s, m) => s + m.gastos, 0) / meses.length : 0;

  const saldos = saldosAhorro(fondos, movsAhorro);
  const emergencia = fondos.find((f) => f.nombre.toLowerCase().includes("emergencia"));
  // Mientras haya deudas caras, el simulador propone un colchón inicial de 1 mes de gastos
  // (no la meta completa del fondo, que frenaría el pago de deudas durante años).
  const metaCompleta = num(emergencia?.meta) || num(hogar.meses_fondo_emergencia) * gastoMensual;
  const fondo = {
    saldo: emergencia ? saldos.get(emergencia.id)?.saldo ?? 0 : 0,
    meta: Math.round(Math.min(metaCompleta || gastoMensual, gastoMensual)),
  };

  return (
    <>
      <Encabezado
        titulo="Análisis de deudas"
        subtitulo="Diagnóstico de tus préstamos y tarjetas, y un simulador para decidir a qué abonar"
      />
      <AnalisisDeudas deudas={deudas} ingresoMensual={ingresoMensual} limiteDeuda={num(hogar.limite_deuda)} fondo={fondo} hoy={hoy} />
    </>
  );
}
