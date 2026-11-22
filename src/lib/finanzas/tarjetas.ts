import { num, type MovTarjeta, type Tarjeta } from "../tipos";

/**
 * Estado de una tarjeta (hoja Tarjetas del Excel). Línea revolvente:
 *   saldo actual = saldo de referencia + consumos + cargos − pagos
 * Los gastos enlazados (en RD$) también cuentan: "pagado con" la tarjeta sube
 * el saldo (consumo) y "pago a" la tarjeta lo baja.
 */
export interface EstadoTarjeta {
  tarjeta: Tarjeta;
  saldo: number;           // moneda de la tarjeta
  limite: number;
  disponible: number;
  utilizacion: number | null;
  sobregiro: number;
  tasaMensual: number;
  pagoPlaneado: number;
  saldoFinanciado: number;
  interesEstimado: number;
  mesesParaSaldar: number | null; // Infinity = el pago no cubre los intereses
  consumos: number;
  pagos: number;
  /** Factor para llevar montos de la tarjeta a RD$. */
  aRD: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function mesesParaSaldar(saldo: number, pago: number, tasaMensual: number): number | null {
  if (saldo <= 0) return 0;
  if (pago <= 0) return null;
  if (tasaMensual <= 0) return saldo / pago;
  const x = (tasaMensual * saldo) / pago;
  if (x >= 1) return Infinity;
  return -Math.log(1 - x) / Math.log(1 + tasaMensual);
}

export function estadoTarjeta(
  t: Tarjeta,
  movimientos: MovTarjeta[],
  pagosDesdeGastosRD: { fecha: string; monto: number }[],
  tasaCambio: number,
  consumosDesdeGastosRD: { fecha: string; monto: number }[] = [],
): EstadoTarjeta {
  const aRD = t.moneda === "USD" ? tasaCambio || 1 : 1;
  const desde = t.fecha_referencia;
  const movs = movimientos.filter((m) => m.tarjeta_id === t.id && m.fecha > desde);
  const suma = (tipo: MovTarjeta["tipo"]) => movs.filter((m) => m.tipo === tipo).reduce((s, m) => s + num(m.monto), 0);
  const desdeGastos = (l: { fecha: string; monto: number }[]) =>
    l.filter((g) => g.fecha > desde).reduce((s, g) => s + g.monto, 0) / aRD;
  const pagosGasto = desdeGastos(pagosDesdeGastosRD);
  const consumosGasto = desdeGastos(consumosDesdeGastosRD);

  const consumos = suma("consumo") + suma("cargo") + consumosGasto;
  const pagos = suma("pago") + pagosGasto;
  const saldo = r2(num(t.saldo_referencia) + consumos - pagos);
  const limite = num(t.limite);
  const tasaMensual = num(t.tasa_anual) / 12;
  const pagoPlaneado = num(t.pago_programado) || num(t.pago_minimo);
  const saldoFinanciado = Math.max(saldo - pagoPlaneado, 0);

  return {
    tarjeta: t,
    saldo,
    limite,
    disponible: r2(limite - saldo),
    utilizacion: limite > 0 ? saldo / limite : null,
    sobregiro: r2(Math.max(saldo - limite, 0)),
    tasaMensual,
    pagoPlaneado,
    saldoFinanciado: r2(saldoFinanciado),
    interesEstimado: r2(saldoFinanciado * tasaMensual),
    mesesParaSaldar: mesesParaSaldar(saldo, pagoPlaneado, tasaMensual),
    consumos: r2(consumos),
    pagos: r2(pagos),
    aRD,
  };
}

export function nivelUtilizacion(u: number | null): "ok" | "medio" | "alto" {
  if (u === null) return "ok";
  if (u > 0.8) return "alto";
  if (u > 0.3) return "medio";
  return "ok";
}
