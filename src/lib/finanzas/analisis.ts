/**
 * Análisis de deudas y simulador de pago.
 *
 * Todo se calcula en RD$ y por meses (interés mensual = saldo × tasa anual / 12).
 * Es una aproximación para comparar estrategias; la tabla exacta de cada préstamo
 * (interés por días) sigue en la pantalla de Préstamos.
 */

export interface Deuda {
  id: string;
  nombre: string;
  tipo: "prestamo" | "tarjeta";
  saldo: number;            // RD$
  tasaAnual: number;        // 0.24 = 24 %
  pagoMinimo: number;       // cuota del préstamo o pago mínimo/programado de la tarjeta (RD$)
  seguroMensual: number;    // préstamos: seguro/cargos fijos incluidos en la cuota
  limite: number | null;    // tarjetas (RD$)
  penalidad: number;        // fracción cobrada al abonar antes de tiempo (0.03 = 3 %)
}

export type Estrategia = "recomendada" | "avalancha" | "bola_nieve" | "personalizada";

export const NOMBRES_ESTRATEGIA: Record<Estrategia, string> = {
  recomendada: "Recomendada",
  avalancha: "Avalancha (mayor tasa)",
  bola_nieve: "Bola de nieve (menor saldo)",
  personalizada: "A mi manera",
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Interés + seguro de un mes con el saldo actual. */
export const costoMensual = (d: Deuda) => d.saldo * (d.tasaAnual / 12) + (d.saldo > 0 ? d.seguroMensual : 0);

/**
 * Costo efectivo anual: la tasa más los seguros/cargos fijos repartidos sobre el
 * saldo. Un préstamo al 11 % con RD$3,656 de seguro sobre RD$900k cuesta ~15.9 %.
 */
export const costoEfectivoAnual = (d: Deuda) => (d.saldo > 0 ? d.tasaAnual + (d.seguroMensual * 12) / d.saldo : 0);

/** Pago mensual de referencia: el registrado o, si la tarjeta no tiene, interés + 1 % del saldo (mín. RD$500). */
export const pagoBase = (d: Deuda) =>
  d.pagoMinimo > 0 ? d.pagoMinimo : d.saldo > 0 ? Math.max(d.saldo * (d.tasaAnual / 12) + d.saldo * 0.01, 500) : 0;

/** Lo que libera cada peso pagado: pago mensual que desaparece al saldar, entre el saldo. */
export const liberacionPorPeso = (d: Deuda) => (d.saldo > 0 ? pagoBase(d) / d.saldo : 0);

export const sobregiro = (d: Deuda) => (d.tipo === "tarjeta" && d.limite ? Math.max(d.saldo - d.limite, 0) : 0);

/** Pago mínimo exigible este mes (si la tarjeta no tiene uno, interés + 1 % del saldo, mínimo RD$500). */
export function pagoExigible(d: Deuda): number {
  if (d.saldo <= 0) return 0;
  const interes = d.saldo * (d.tasaAnual / 12);
  const base = d.pagoMinimo > 0 ? d.pagoMinimo : Math.max(interes + d.saldo * 0.01, 500);
  return Math.min(base, d.saldo + interes + d.seguroMensual);
}

export interface Prioridad {
  id: string;
  puesto: number;
  motivo: string;
}

/**
 * Orden recomendado para el dinero extra de este mes. Combina, en este orden:
 *  1. Sobregiros: bajar las tarjetas a su límite (cargos extra + daño al historial).
 *  2. Liquidaciones rápidas: deudas que se pueden saldar con el dinero disponible y
 *     que liberan mucho flujo (pago mensual ≥ 8 % del saldo).
 *  3. El resto por costo efectivo (tasa + seguros), descontando la penalidad por
 *     pago anticipado; las deudas al 0 % quedan al final.
 */
export function ordenRecomendado(deudas: Deuda[], disponible: number): Prioridad[] {
  const vivas = deudas.filter((d) => d.saldo > 0.005);
  const usados = new Set<string>();
  const salida: Prioridad[] = [];
  const agregar = (d: Deuda, motivo: string) => {
    if (usados.has(d.id)) return;
    usados.add(d.id);
    salida.push({ id: d.id, puesto: salida.length + 1, motivo });
  };

  vivas.filter((d) => sobregiro(d) > 0)
    .sort((a, b) => b.tasaAnual - a.tasaAnual || sobregiro(a) - sobregiro(b))
    .forEach((d) => agregar(d, "Está en sobregiro: genera cargos extra y afecta tu historial de crédito"));

  let resto = disponible;
  vivas.filter((d) => !usados.has(d.id) && liberacionPorPeso(d) >= 0.08 && d.tasaAnual > 0)
    .sort((a, b) => liberacionPorPeso(b) - liberacionPorPeso(a))
    .forEach((d) => {
      if (d.saldo <= resto) {
        resto -= d.saldo;
        agregar(d, `Se puede saldar ya y libera ${Math.round(pagoBase(d)).toLocaleString("es-DO")} al mes`);
      }
    });

  const puntaje = (d: Deuda) => costoEfectivoAnual(d) - d.penalidad;
  vivas.filter((d) => !usados.has(d.id))
    .sort((a, b) => (a.tasaAnual === 0 ? 1 : 0) - (b.tasaAnual === 0 ? 1 : 0) || puntaje(b) - puntaje(a))
    .forEach((d) => {
      const pct = (costoEfectivoAnual(d) * 100).toFixed(1);
      agregar(d, d.tasaAnual === 0
        ? "No cobra interés: conviene pagarla normal y abonar a las demás"
        : d.penalidad > 0
          ? `Costo efectivo ${pct} % al año, pero cobra ${(d.penalidad * 100).toFixed(1)} % por abonar antes`
          : `Costo efectivo ${pct} % al año${d.seguroMensual > 0 ? " (incluye seguros)" : ""}`);
    });
  return salida;
}

function ordenPorEstrategia(estrategia: Estrategia, deudas: Deuda[], disponible: number, ordenManual: string[]): string[] {
  const vivas = deudas.filter((d) => d.saldo > 0.005);
  switch (estrategia) {
    case "avalancha":
      return [...vivas].sort((a, b) => b.tasaAnual - a.tasaAnual).map((d) => d.id);
    case "bola_nieve":
      return [...vivas].sort((a, b) => a.saldo - b.saldo).map((d) => d.id);
    case "personalizada": {
      const vivasIds = new Set(vivas.map((d) => d.id));
      const manual = ordenManual.filter((id) => vivasIds.has(id));
      const resto = ordenRecomendado(vivas, disponible).map((p) => p.id).filter((id) => !manual.includes(id));
      return [...manual, ...resto];
    }
    default:
      return ordenRecomendado(vivas, disponible).map((p) => p.id);
  }
}

export interface OpcionesSimulacion {
  estrategia: Estrategia;
  extraMensual: number;
  abonoInicial: number;
  /** Si los pagos de las deudas ya saldadas se suman al abono (efecto bola de nieve). */
  reinvertirLiberado: boolean;
  /** Reservar una parte del extra para el fondo de emergencia hasta llegar a la meta. */
  fondo?: { saldo: number; meta: number; porcentaje: number };
  ordenManual?: string[];
  maxMeses?: number;
}

export interface MesSimulado {
  mes: number;              // 1 = el próximo mes
  saldoTotal: number;
  pagado: number;           // mínimos + extra
  extraAplicado: Record<string, number>;
  alFondo: number;
  saldadas: string[];
}

export interface ResultadoSimulacion {
  meses: MesSimulado[];
  mesLibre: number | null;  // meses hasta saldar todo (null = no termina)
  totalCostos: number;      // intereses + seguros + penalidades pagados
  totalPagado: number;
  saldadoEn: Record<string, number>;
  fondoFinal: number;
  noAlcanza: boolean;       // los mínimos no cubren los intereses de alguna deuda
}

export function simular(deudasIniciales: Deuda[], op: OpcionesSimulacion): ResultadoSimulacion {
  const deudas = deudasIniciales.map((d) => ({ ...d }));
  const liberaAlSaldar = new Map(deudasIniciales.map((d) => [d.id, pagoBase(d)]));
  const maxMeses = op.maxMeses ?? 600;
  const meses: MesSimulado[] = [];
  const saldadoEn: Record<string, number> = {};
  let totalCostos = 0;
  let totalPagado = 0;
  let liberado = 0;
  let fondo = op.fondo?.saldo ?? 0;
  let noAlcanza = false;

  for (const d of deudas) if (d.saldo <= 0.005) saldadoEn[d.id] = 0;

  for (let mes = 1; mes <= maxMeses; mes++) {
    if (deudas.every((d) => d.saldo <= 0.005)) break;
    const extraAplicado: Record<string, number> = {};
    const saldadas: string[] = [];
    let pagado = 0;

    // 1) Intereses y seguros del mes, y pago mínimo de cada deuda
    for (const d of deudas) {
      if (d.saldo <= 0.005) continue;
      const interes = d.saldo * (d.tasaAnual / 12);
      const seguro = d.seguroMensual;
      const minimo = pagoExigible(d);
      totalCostos += interes + seguro;
      const capital = minimo - interes - seguro;
      if (capital <= 0 && op.extraMensual === 0) noAlcanza = true;
      d.saldo = Math.max(d.saldo + interes + seguro - minimo, 0);
      pagado += minimo;
    }

    // 2) Dinero extra del mes
    let extra = op.extraMensual + (mes === 1 ? op.abonoInicial : 0) + (op.reinvertirLiberado ? liberado : 0);
    let alFondo = 0;
    if (op.fondo && fondo < op.fondo.meta && op.extraMensual > 0) {
      alFondo = Math.min(op.extraMensual * op.fondo.porcentaje, op.fondo.meta - fondo);
      fondo += alFondo;
      extra -= alFondo;
    }

    const abonar = (d: Deuda, maximo: number) => {
      const abono = Math.min(extra, maximo * (1 + d.penalidad));
      if (abono <= 0) return;
      const penal = (abono / (1 + d.penalidad)) * d.penalidad;
      totalCostos += penal;
      d.saldo = Math.max(d.saldo - (abono - penal), 0);
      extra -= abono;
      pagado += abono;
      extraAplicado[d.id] = r2((extraAplicado[d.id] ?? 0) + abono);
    };
    // En la recomendada, a las tarjetas en sobregiro primero se les baja hasta su límite;
    // después compiten por costo con las demás deudas.
    if (op.estrategia === "recomendada") {
      for (const d of [...deudas].filter((x) => sobregiro(x) > 0).sort((a, b) => b.tasaAnual - a.tasaAnual || sobregiro(a) - sobregiro(b))) {
        if (extra <= 0.005) break;
        abonar(d, sobregiro(d));
      }
    }
    for (const id of ordenPorEstrategia(op.estrategia, deudas, extra, op.ordenManual ?? [])) {
      if (extra <= 0.005) break;
      const d = deudas.find((x) => x.id === id)!;
      if (d.saldo > 0.005) abonar(d, d.saldo);
    }
    if (extra > 0.005 && op.fondo) fondo += extra; // sobra: todas saldadas

    // 3) Deudas saldadas este mes: su pago queda libre para los meses siguientes
    for (const d of deudas) {
      if (d.saldo <= 0.005 && saldadoEn[d.id] === undefined) {
        d.saldo = 0;
        saldadoEn[d.id] = mes;
        saldadas.push(d.id);
        liberado += liberaAlSaldar.get(d.id) ?? 0;
      }
    }

    totalPagado += pagado;
    meses.push({
      mes, saldoTotal: r2(deudas.reduce((s, d) => s + d.saldo, 0)), pagado: r2(pagado), extraAplicado,
      alFondo: r2(alFondo), saldadas,
    });
  }

  const libre = deudas.every((d) => d.saldo <= 0.005);
  return {
    meses,
    mesLibre: libre ? meses.length : null,
    totalCostos: r2(totalCostos),
    totalPagado: r2(totalPagado),
    saldadoEn,
    fondoFinal: r2(fondo),
    noAlcanza,
  };
}

/** Línea base: seguir pagando solo los mínimos, sin extra. */
export const simularActual = (deudas: Deuda[]) =>
  simular(deudas, { estrategia: "recomendada", extraMensual: 0, abonoInicial: 0, reinvertirLiberado: false });

export interface Alerta { nivel: "alto" | "medio"; texto: string }

export interface Diagnostico {
  deudaTotal: number;
  costoMensual: number;          // intereses + seguros de este mes
  pagosMinimos: number;          // lo que exigen las deudas cada mes
  ingresoMensual: number;
  pctCosto: number | null;       // costo mensual / ingreso
  pctPagos: number | null;       // pagos mínimos / ingreso
  utilizacionTarjetas: number | null;
  alertas: Alerta[];
}

export function diagnosticar(deudas: Deuda[], ingresoMensual: number, limiteDeuda: number): Diagnostico {
  const vivas = deudas.filter((d) => d.saldo > 0.005);
  const deudaTotal = vivas.reduce((s, d) => s + d.saldo, 0);
  const costo = vivas.reduce((s, d) => s + costoMensual(d), 0);
  const pagos = vivas.reduce((s, d) => s + pagoExigible(d), 0);
  const tarjetas = vivas.filter((d) => d.tipo === "tarjeta" && d.limite);
  const limiteTotal = tarjetas.reduce((s, d) => s + (d.limite ?? 0), 0);
  const saldoTarjetas = tarjetas.reduce((s, d) => s + d.saldo, 0);
  const alertas: Alerta[] = [];

  const enSobregiro = tarjetas.filter((d) => sobregiro(d) > 0);
  if (enSobregiro.length) {
    alertas.push({ nivel: "alto", texto: `${enSobregiro.length} tarjeta(s) en sobregiro por RD$${Math.round(enSobregiro.reduce((s, d) => s + sobregiro(d), 0)).toLocaleString("es-DO")} en total: es lo primero a resolver.` });
  }
  for (const d of vivas) {
    const interes = d.saldo * (d.tasaAnual / 12) + d.seguroMensual;
    if (pagoExigible(d) <= interes + 0.5) alertas.push({ nivel: "alto", texto: `El pago de ${d.nombre} no cubre ni los intereses: la deuda no baja.` });
  }
  if (ingresoMensual > 0 && pagos / ingresoMensual > limiteDeuda) {
    alertas.push({ nivel: "alto", texto: `Los pagos de deuda son el ${Math.round((pagos / ingresoMensual) * 100)} % de tu ingreso (tu límite es ${Math.round(limiteDeuda * 100)} %).` });
  }
  if (limiteTotal > 0 && saldoTarjetas / limiteTotal > 0.3) {
    alertas.push({ nivel: saldoTarjetas / limiteTotal > 0.8 ? "alto" : "medio", texto: `Usas el ${Math.round((saldoTarjetas / limiteTotal) * 100)} % del límite de tus tarjetas; por encima del 30 % afecta tu historial.` });
  }
  const caras = vivas.filter((d) => d.tipo === "tarjeta" && d.tasaAnual >= 0.4);
  // Referencia realista: un préstamo de consolidación que ya tengas (no el más barato, que puede ser especial)
  const consolidacionPrevia = vivas.find((d) => d.tipo === "prestamo" && /consolid/i.test(d.nombre) && d.tasaAnual > 0);
  if (caras.length && caras.reduce((s, d) => s + d.saldo, 0) > 20000) {
    alertas.push({ nivel: "medio", texto: `Tienes RD$${Math.round(caras.reduce((s, d) => s + d.saldo, 0)).toLocaleString("es-DO")} en tarjetas al ${Math.round(Math.min(...caras.map((d) => d.tasaAnual)) * 100)} % o más.${consolidacionPrevia ? ` Consolidarlas en un préstamo como ${consolidacionPrevia.nombre} (${Math.round(consolidacionPrevia.tasaAnual * 100)} %) podría ahorrarte mucho: simúlalo abajo.` : " Consolidarlas en un préstamo a menor tasa podría ahorrarte mucho: simúlalo abajo."}` });
  }

  return {
    deudaTotal: r2(deudaTotal),
    costoMensual: r2(costo),
    pagosMinimos: r2(pagos),
    ingresoMensual: r2(ingresoMensual),
    pctCosto: ingresoMensual > 0 ? costo / ingresoMensual : null,
    pctPagos: ingresoMensual > 0 ? pagos / ingresoMensual : null,
    utilizacionTarjetas: limiteTotal > 0 ? saldoTarjetas / limiteTotal : null,
    alertas,
  };
}

export interface Consolidacion {
  /** false = pagando esa cuota a las tarjetas, nunca se terminarían de pagar */
  tarjetasTerminan: boolean;
  monto: number;
  cuota: number;
  costoActual: number;      // intereses que pagarías por esas tarjetas pagando lo mismo
  costoConsolidado: number; // intereses del préstamo nuevo
  ahorro: number;
}

/** ¿Y si junto las tarjetas elegidas en un préstamo a tasa X y N meses? */
export function simularConsolidacion(tarjetas: Deuda[], tasaAnual: number, plazoMeses: number): Consolidacion | null {
  const monto = tarjetas.reduce((s, d) => s + d.saldo, 0);
  if (monto <= 0 || plazoMeses <= 0) return null;
  const i = tasaAnual / 12;
  const cuota = i === 0 ? monto / plazoMeses : (monto * i) / (1 - Math.pow(1 + i, -plazoMeses));
  const costoConsolidado = cuota * plazoMeses - monto;
  // Pagando esa misma cuota a las tarjetas (repartida por la estrategia avalancha)
  const actual = simular(tarjetas.map((d) => ({ ...d, pagoMinimo: 0.01 })), {
    estrategia: "avalancha", extraMensual: cuota, abonoInicial: 0, reinvertirLiberado: true, maxMeses: 600,
  });
  const tarjetasTerminan = actual.mesLibre !== null;
  return {
    tarjetasTerminan,
    monto: r2(monto),
    cuota: r2(cuota),
    costoActual: tarjetasTerminan ? actual.totalCostos : Infinity,
    costoConsolidado: r2(costoConsolidado),
    ahorro: tarjetasTerminan ? r2(actual.totalCostos - costoConsolidado) : Infinity,
  };
}
