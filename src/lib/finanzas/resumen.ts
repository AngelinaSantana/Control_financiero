import { anioDe, mesDe } from "../fechas";
import {
  esPagoTarjeta,
  num,
  type Categoria,
  type ConceptoPresupuesto,
  type Gasto,
  type Ingreso,
  type MontoPresupuesto,
  type MovAhorro,
  type PagoPersonal,
  type PrestamoPersonal,
} from "../tipos";

const r2 = (n: number) => Math.round(n * 100) / 100;
const doce = () => Array.from({ length: 12 }, () => 0);

export const esCategoriaDeuda = (nombre: string | undefined) => !!nombre && nombre.toLowerCase().startsWith("deuda");

export interface FilaResumen {
  ingresos: number;
  ingresosFijos: number;
  ingresosVariables: number;
  ingresosUnicos: number;
  gastos: number;
  gastosFijos: number;
  gastosVariables: number;
  gastosUnicos: number;
  servicioDeuda: number;
  pagosTarjetas: number;
  flujoNeto: number;
  ahorro: number;
  sinFondo: number;
  tasaAhorro: number | null;
  pctDeuda: number | null;
  pctGasto: number | null;
}

function fila(): FilaResumen {
  return {
    ingresos: 0, ingresosFijos: 0, ingresosVariables: 0, ingresosUnicos: 0,
    gastos: 0, gastosFijos: 0, gastosVariables: 0, gastosUnicos: 0,
    servicioDeuda: 0, pagosTarjetas: 0, flujoNeto: 0, ahorro: 0, sinFondo: 0,
    tasaAhorro: null, pctDeuda: null, pctGasto: null,
  };
}

function cerrar(f: FilaResumen): FilaResumen {
  for (const k of Object.keys(f) as (keyof FilaResumen)[]) {
    const v = f[k];
    if (typeof v === "number") (f[k] as number) = r2(v);
  }
  f.flujoNeto = r2(f.ingresos - f.gastos);
  f.sinFondo = r2(f.flujoNeto - f.ahorro);
  f.tasaAhorro = f.ingresos > 0 ? f.ahorro / f.ingresos : null;
  f.pctDeuda = f.ingresos > 0 ? f.servicioDeuda / f.ingresos : null;
  f.pctGasto = f.ingresos > 0 ? f.gastos / f.ingresos : null;
  return f;
}

/** Resumen mensual del año (hoja Resumen). */
export function resumenAnual(
  anio: number,
  ingresos: Ingreso[],
  gastos: Gasto[],
  ahorros: MovAhorro[],
  categorias: Categoria[],
) {
  const nombreCat = new Map(categorias.map((c) => [c.id, c.nombre]));
  const meses = Array.from({ length: 12 }, fila);

  for (const i of ingresos) {
    if (anioDe(i.fecha) !== anio) continue;
    const f = meses[mesDe(i.fecha) - 1];
    const m = num(i.monto);
    f.ingresos += m;
    if (i.tipo === "Fijo") f.ingresosFijos += m;
    else if (i.tipo === "Variable") f.ingresosVariables += m;
    else f.ingresosUnicos += m;
  }
  for (const g of gastos) {
    if (anioDe(g.fecha) !== anio) continue;
    const f = meses[mesDe(g.fecha) - 1];
    const m = num(g.monto);
    // Pago a tarjeta = transferencia: cuenta como servicio de deuda, no como gasto
    // (las compras con la tarjeta ya se registraron como gasto de su categoría).
    if (esPagoTarjeta(g)) {
      f.pagosTarjetas += m;
      f.servicioDeuda += m;
      continue;
    }
    f.gastos += m;
    if (g.tipo === "Fijo") f.gastosFijos += m;
    else if (g.tipo === "Variable") f.gastosVariables += m;
    else f.gastosUnicos += m;
    if (esCategoriaDeuda(nombreCat.get(g.categoria_id ?? ""))) f.servicioDeuda += m;
  }
  for (const a of ahorros) {
    if (anioDe(a.fecha) !== anio) continue;
    meses[mesDe(a.fecha) - 1].ahorro += a.tipo === "aporte" ? num(a.monto) : -num(a.monto);
  }

  const total = fila();
  for (const f of meses) {
    for (const k of Object.keys(total) as (keyof FilaResumen)[]) {
      if (typeof f[k] === "number" && typeof total[k] === "number") (total[k] as number) += f[k] as number;
    }
  }
  const conDatos = meses.filter((f) => f.ingresos || f.gastos).length || 1;
  const promedio = fila();
  for (const k of Object.keys(total) as (keyof FilaResumen)[]) {
    if (typeof total[k] === "number") (promedio[k] as number) = (total[k] as number) / conDatos;
  }

  return { meses: meses.map(cerrar), total: cerrar(total), promedio: cerrar(promedio), mesesConDatos: conDatos };
}

export interface FilaDesviacion {
  categoriaId: string;
  categoria: string;
  planeado: number[];
  real: number[];
  totalPlaneado: number;
  totalReal: number;
}

/** Presupuesto planeado vs. gasto real por categoría y mes (hoja Desviaciones). */
export function desviaciones(
  anio: number,
  categorias: Categoria[],
  conceptos: ConceptoPresupuesto[],
  montos: MontoPresupuesto[],
  gastos: Gasto[],
): FilaDesviacion[] {
  const catDeConcepto = new Map(conceptos.map((c) => [c.id, c.categoria_id]));
  const filas = new Map<string, FilaDesviacion>();
  const sinCat: FilaDesviacion = {
    categoriaId: "", categoria: "Sin categoría", planeado: doce(), real: doce(), totalPlaneado: 0, totalReal: 0,
  };
  for (const c of categorias.filter((c) => c.tipo === "gasto").sort((a, b) => a.orden - b.orden)) {
    filas.set(c.id, { categoriaId: c.id, categoria: c.nombre, planeado: doce(), real: doce(), totalPlaneado: 0, totalReal: 0 });
  }
  for (const m of montos) {
    if (m.anio !== anio) continue;
    const f = filas.get(catDeConcepto.get(m.concepto_id) ?? "") ?? sinCat;
    f.planeado[m.mes - 1] += num(m.monto);
  }
  for (const g of gastos) {
    if (anioDe(g.fecha) !== anio || esPagoTarjeta(g)) continue;
    const f = filas.get(g.categoria_id ?? "") ?? sinCat;
    f.real[mesDe(g.fecha) - 1] += num(g.monto);
  }
  const todas = [...filas.values(), sinCat];
  for (const f of todas) {
    f.planeado = f.planeado.map(r2);
    f.real = f.real.map(r2);
    f.totalPlaneado = r2(f.planeado.reduce((a, b) => a + b, 0));
    f.totalReal = r2(f.real.reduce((a, b) => a + b, 0));
  }
  return todas.filter((f) => f.categoriaId || f.totalPlaneado || f.totalReal);
}

export interface EstadoPersonal {
  prestamo: PrestamoPersonal;
  pagado: number;
  saldo: number;
  pagos: PagoPersonal[];
}

export function estadoPersonales(prestamos: PrestamoPersonal[], pagos: PagoPersonal[]): EstadoPersonal[] {
  return prestamos.map((p) => {
    const mios = pagos.filter((x) => x.prestamo_personal_id === p.id).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const pagado = r2(mios.reduce((s, x) => s + num(x.monto), 0));
    return { prestamo: p, pagado, saldo: r2(num(p.monto) - pagado), pagos: mios };
  });
}

export function saldosAhorro(fondos: { id: string }[], movs: MovAhorro[]) {
  const res = new Map<string, { aportes: number; retiros: number; saldo: number }>();
  for (const f of fondos) res.set(f.id, { aportes: 0, retiros: 0, saldo: 0 });
  for (const m of movs) {
    const s = res.get(m.fondo_id);
    if (!s) continue;
    if (m.tipo === "aporte") s.aportes += num(m.monto);
    else s.retiros += num(m.monto);
    s.saldo = r2(s.aportes - s.retiros);
  }
  return res;
}
