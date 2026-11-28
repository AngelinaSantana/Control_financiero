import { diasEntre, hoyISO, sumarMeses } from "../fechas";
import { num, type Prestamo } from "../tipos";

/**
 * Amortización con interés por DÍAS reales (igual que la hoja Amort_n del Excel):
 *   interés  = saldo × (tasa anual / base de días) × días del período
 *   capital  = cuota total − interés − seguro
 * La cuota total incluye el seguro. Un abono extra reduce el saldo y acorta el plazo.
 */

export interface FilaAmortizacion {
  n: number;
  fecha: string;
  dias: number;
  saldoInicial: number;
  interes: number;
  seguro: number;
  capital: number;
  abonoExtra: number;
  cuota: number;
  saldoFinal: number;
  pagada: boolean;
}

export interface OpcionesAmortizacion {
  /** Abonos extra registrados (sólo cuentan los posteriores a la foto de referencia). */
  abonos?: { fecha: string; monto: number }[];
  /** Simulación: abono extra fijo en cada cuota futura. */
  abonoMensual?: number;
  /** Cuotas pagadas después de la foto de referencia. */
  cuotasPagadasDespues?: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const MAX_FILAS = 600;

export function puntoDePartida(p: Prestamo) {
  const conFoto = p.saldo_referencia !== null && p.saldo_referencia !== undefined && p.saldo_referencia !== "";
  const n0 = conFoto ? p.cuotas_pagadas_referencia : 0;
  const saldo = conFoto ? num(p.saldo_referencia) : num(p.monto_original);
  const fechaPrevia = n0 > 0 ? sumarMeses(p.fecha_primera_cuota, n0 - 1) : p.fecha_inicio;
  return { conFoto, n0, saldo, fechaPrevia, fechaFoto: conFoto ? p.fecha_referencia : null };
}

export function amortizacion(p: Prestamo, op: OpcionesAmortizacion = {}): FilaAmortizacion[] {
  const tasa = num(p.tasa_anual);
  const base = p.base_dias === 365 ? 365 : 360;
  const cuotaTotal = num(p.cuota_total);
  const seguro = num(p.seguro_cuota);
  const inicio = puntoDePartida(p);
  const pagadasHasta = inicio.n0 + (op.cuotasPagadasDespues ?? 0);
  const abonos = (op.abonos ?? []).filter((a) => !inicio.fechaFoto || a.fecha > inicio.fechaFoto);

  const filas: FilaAmortizacion[] = [];
  let saldo = inicio.saldo;
  let previa = inicio.fechaPrevia;
  let n = inicio.n0;

  while (saldo > 0.005 && filas.length < MAX_FILAS) {
    n += 1;
    const fecha = sumarMeses(p.fecha_primera_cuota, n - 1);
    const dias = Math.max(diasEntre(previa, fecha), 0);
    const interes = r2(saldo * (tasa / base) * dias);
    let capital = r2(cuotaTotal - interes - seguro);
    let abono = r2(
      abonos.filter((a) => a.fecha > previa && a.fecha <= fecha).reduce((s, a) => s + a.monto, 0) +
        (n > pagadasHasta ? op.abonoMensual ?? 0 : 0),
    );

    // Si la cuota no cubre ni el interés, no hay amortización: cortamos al plazo pactado.
    if (capital <= 0 && abono <= 0 && n > p.cuotas_totales) break;
    capital = Math.max(capital, 0);
    // En la última cuota pactada el banco liquida el saldo que quede (cuota de ajuste).
    if (n === p.cuotas_totales && !op.abonoMensual) capital = Math.max(capital, r2(saldo - abono));
    if (capital >= saldo) {
      capital = r2(saldo);
      abono = 0;
    } else if (capital + abono > saldo) {
      abono = r2(saldo - capital);
    }

    const saldoFinal = r2(saldo - capital - abono);
    filas.push({
      n,
      fecha,
      dias,
      saldoInicial: r2(saldo),
      interes,
      seguro,
      capital,
      abonoExtra: abono,
      cuota: r2(interes + seguro + capital),
      saldoFinal,
      pagada: n <= pagadasHasta,
    });
    saldo = saldoFinal;
    previa = fecha;
  }
  return filas;
}

export interface EstadoPrestamo {
  prestamo: Prestamo;
  filas: FilaAmortizacion[];
  cuotasPagadas: number;
  cuotasRestantes: number;
  saldoActual: number;
  proxima: FilaAmortizacion | null;
  totalPendiente: number;
  interesesSegurosPendientes: number;
  fechaFin: string | null;
  alertas: string[];
}

/**
 * Estado actual de un préstamo. Los gastos enlazados (cuotas pagadas desde
 * Movimientos) se convierten en cuotas pagadas sumando sus montos, así un
 * pago dividido en dos quincenas cuenta como una cuota.
 */
export function estadoPrestamo(
  p: Prestamo,
  pagos: { fecha: string; monto: number }[],
  abonos: { fecha: string; monto: number }[] = [],
  abonoMensual = 0,
  hoy: string = hoyISO(),
): EstadoPrestamo {
  const inicio = puntoDePartida(p);
  const cuota = num(p.cuota_total);
  const pagado = pagos
    .filter((g) => !inicio.fechaFoto || g.fecha > inicio.fechaFoto)
    .reduce((s, g) => s + g.monto, 0);
  const cuotasPagadasDespues = cuota > 0 ? Math.floor((pagado + 0.5) / cuota) : 0;

  const filas = amortizacion(p, { abonos, abonoMensual, cuotasPagadasDespues });
  const pagadas = filas.filter((f) => f.pagada);
  const pendientes = filas.filter((f) => !f.pagada);
  const ultimaPagada = pagadas.at(-1);
  // Los abonos extra ya hechos (hasta hoy) cuentan aunque la cuota de ese período
  // aún no se haya pagado: en la tabla se aplican dentro de esa cuota, pero el
  // saldo de hoy ya debe reflejarlos.
  const desdeUltimaPagada = ultimaPagada?.fecha ?? inicio.fechaPrevia;
  const abonosYaHechos = abonos
    .filter((a) => (!inicio.fechaFoto || a.fecha > inicio.fechaFoto) && a.fecha > desdeUltimaPagada && a.fecha <= hoy)
    .reduce((s, a) => s + a.monto, 0);
  const saldoActual = Math.max((ultimaPagada ? ultimaPagada.saldoFinal : inicio.saldo) - abonosYaHechos, 0);

  const alertas: string[] = [];
  const ultima = filas.at(-1);
  if (ultima && ultima.saldoFinal > 0.005) alertas.push("La cuota no cubre el préstamo dentro del plazo");
  else if (ultima && ultima.n > p.cuotas_totales) {
    alertas.push(`Con esta cuota termina en la cuota ${ultima.n}, no en la ${p.cuotas_totales}`);
  } else if (ultima && !ultima.pagada && cuota > 0 && ultima.cuota > cuota * 1.1) {
    alertas.push(`La última cuota (${ultima.fecha}) sería de ajuste: RD$${ultima.cuota.toFixed(2)}. Revisa cuota y plazo.`);
  }
  if (filas.some((f) => !f.pagada && f.capital <= 0)) alertas.push("Hay cuotas que no cubren el interés");

  return {
    prestamo: p,
    filas,
    cuotasPagadas: inicio.n0 + Math.min(cuotasPagadasDespues, filas.length),
    cuotasRestantes: pendientes.length,
    saldoActual: r2(saldoActual),
    proxima: pendientes[0] ?? null,
    totalPendiente: r2(pendientes.reduce((s, f) => s + f.cuota, 0)),
    interesesSegurosPendientes: r2(pendientes.reduce((s, f) => s + f.interes + f.seguro, 0)),
    fechaFin: ultima?.fecha ?? null,
    alertas,
  };
}

export interface MesCalendario {
  clave: string; // YYYY-MM
  total: number;
  porPrestamo: Record<string, number>;
  terminan: string[]; // ids de préstamos cuya última cuota cae este mes
}

/** Calendario de deuda: suma de cuotas pendientes por mes (hoja Calendario_Deuda). */
export function calendarioDeuda(estados: EstadoPrestamo[], meses = 24, desde?: string): MesCalendario[] {
  const mapa = new Map<string, MesCalendario>();
  for (const e of estados) {
    const pend = e.filas.filter((f) => !f.pagada);
    pend.forEach((f, i) => {
      const clave = f.fecha.slice(0, 7);
      if (desde && clave < desde) return;
      const m = mapa.get(clave) ?? { clave, total: 0, porPrestamo: {}, terminan: [] };
      m.total = r2(m.total + f.cuota);
      m.porPrestamo[e.prestamo.id] = r2((m.porPrestamo[e.prestamo.id] ?? 0) + f.cuota);
      if (i === pend.length - 1) m.terminan.push(e.prestamo.id);
      mapa.set(clave, m);
    });
  }
  return [...mapa.values()].sort((a, b) => a.clave.localeCompare(b.clave)).slice(0, meses);
}
