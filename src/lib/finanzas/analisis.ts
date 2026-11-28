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
  /** 1 = sacar del sobregiro, 2 = saldar ya (libera flujo), 3 = por costo real, 4 = sin interés (al final) */
  paso: 1 | 2 | 3 | 4;
  motivo: string;
}

export const NOMBRES_PASO: Record<Prioridad["paso"], string> = {
  1: "Sacar del sobregiro",
  2: "Saldar ya",
  3: "Por costo real",
  4: "Sin interés",
};

const rdTexto = (n: number) => `RD$${Math.round(n).toLocaleString("es-DO")}`;

/**
 * Orden de la estrategia Recomendada para el dinero extra:
 *  1. Sacar del sobregiro: a cada tarjeta por encima de su límite se le abona solo
 *     lo necesario para bajarla al límite (mayor tasa primero; si empatan, el
 *     sobregiro más pequeño primero). Luego compite como las demás.
 *  2. Saldar ya: con lo que quede, saldar las deudas cuyo pago mensual es ≥ 8 % del
 *     saldo, si el dinero alcanza para dejarlas en cero (la que más libera por peso primero).
 *  3. El resto por costo real: tasa + seguros/cargos fijos, menos la penalidad por
 *     pago anticipado.
 *  4. Al final, las deudas sin interés.
 *
 * `inicioDeMes`: los saldos son los de hoy (aún falta el pago normal del mes), así que
 * para saber si alcanza se usa montoParaSaldar. Dentro de la simulación el pago del mes
 * ya se descontó y el dinero del sobregiro ya se aplicó.
 */
export function ordenRecomendado(deudas: Deuda[], disponible: number, opciones: { inicioDeMes?: boolean } = {}): Prioridad[] {
  if (!opciones.inicioDeMes) return ordenNucleo(deudas, disponible);

  // Con saldos de hoy se repite exactamente lo que hará la simulación este mes:
  // 1) cada deuda recibe su pago normal (que ya puede sacar una tarjeta del sobregiro),
  // 2) el dinero extra baja al límite las tarjetas que sigan en sobregiro,
  // 3) con lo que quede se aplican los pasos 2 a 4.
  const despues = deudas.map((d) => ({
    ...d,
    saldo: d.saldo <= 0.005 ? 0 : Math.max(d.saldo + d.saldo * (d.tasaAnual / 12) + d.seguroMensual - pagoExigible(d), 0),
  }));
  let resto = disponible;
  const enSobregiro = despues.filter((d) => sobregiro(d) > 0).sort((a, b) => b.tasaAnual - a.tasaAnual || sobregiro(a) - sobregiro(b));
  const necesitaSobregiro = new Map<string, number>();
  for (const d of enSobregiro) {
    const necesita = r2(sobregiro(d) * (1 + d.penalidad));
    necesitaSobregiro.set(d.id, necesita);
    const aplicado = Math.min(Math.max(resto, 0), necesita);
    d.saldo -= aplicado / (1 + d.penalidad);
    resto -= aplicado;
  }
  const nucleo = ordenNucleo(despues, resto);
  const pasoNucleo = new Map(nucleo.map((p) => [p.id, p]));
  const costoTexto = (d: Deuda) => `${(costoEfectivoAnual(d) * 100).toFixed(1)} %`;

  const salida: Prioridad[] = [];
  for (const d of enSobregiro) {
    const n = pasoNucleo.get(d.id);
    const necesita = necesitaSobregiro.get(d.id)!;
    salida.push(n && n.paso === 2
      ? { id: d.id, puesto: 0, paso: 2, motivo: `Sácala del sobregiro y sáldala completa: ${n.motivo}` }
      : { id: d.id, puesto: 0, paso: 1, motivo: `Está en sobregiro: primero bajarla a su límite (después de su pago del mes le faltan ${rdTexto(necesita)}): evita cargos extra y cuida tu historial. Luego compite por su costo real (${costoTexto(d)}).` });
  }
  const yaListadas = new Set(salida.map((p) => p.id));
  for (const p of nucleo) {
    if (yaListadas.has(p.id)) continue;
    const original = deudas.find((x) => x.id === p.id)!;
    const nota = sobregiro(original) > 0 ? " Su pago normal de este mes ya la saca del sobregiro." : "";
    salida.push({ ...p, motivo: p.motivo + nota });
  }
  return salida.map((p, i) => ({ ...p, puesto: i + 1 }));
}

/**
 * Pasos 1 a 4 con saldos ya descontado el pago del mes (como dentro de la simulación,
 * donde además el dinero para los sobregiros ya se aplicó).
 */
function ordenNucleo(deudas: Deuda[], disponible: number): Prioridad[] {
  const vivas = deudas.filter((d) => d.saldo > 0.005);
  const usados = new Set<string>();
  const salida: Prioridad[] = [];
  const agregar = (d: Deuda, paso: Prioridad["paso"], motivo: string) => {
    if (usados.has(d.id)) return;
    usados.add(d.id);
    salida.push({ id: d.id, puesto: salida.length + 1, paso, motivo });
  };
  const costoTexto = (d: Deuda) => `${(costoEfectivoAnual(d) * 100).toFixed(1)} %`;

  // Paso 1: tarjetas que siguen en sobregiro (no alcanzó el dinero para bajarlas al límite).
  let resto = disponible;
  vivas.filter((d) => sobregiro(d) > 0)
    .sort((a, b) => b.tasaAnual - a.tasaAnual || sobregiro(a) - sobregiro(b))
    .forEach((d) => {
      resto -= Math.min(Math.max(resto, 0), sobregiro(d) * (1 + d.penalidad));
      agregar(d, 1, `Primero bajarla a su límite (sobregiro de ${rdTexto(sobregiro(d))}): evita cargos extra y cuida tu historial. Luego compite por su costo real (${costoTexto(d)}).`);
    });

  // Paso 2: saldar ya lo que libera mucho dinero mensual (pago ≥ 8 % del saldo), si alcanza.
  vivas.filter((d) => !usados.has(d.id) && liberacionPorPeso(d) >= 0.08 && d.tasaAnual > 0)
    .sort((a, b) => liberacionPorPeso(b) - liberacionPorPeso(a))
    .forEach((d) => {
      const necesita = r2(d.saldo * (1 + d.penalidad));
      if (necesita <= resto + 0.005) {
        resto -= necesita;
        agregar(d, 2, `Con ${rdTexto(necesita)} la saldas y liberas ${rdTexto(pagoBase(d))} cada mes para las demás deudas.`);
      }
    });

  // Pasos 3 y 4: costo real (tasa + seguros − penalidad); sin interés al final.
  const puntaje = (d: Deuda) => costoEfectivoAnual(d) - d.penalidad;
  vivas.filter((d) => !usados.has(d.id))
    .sort((a, b) => (a.tasaAnual === 0 ? 1 : 0) - (b.tasaAnual === 0 ? 1 : 0) || puntaje(b) - puntaje(a))
    .forEach((d) => {
      if (d.tasaAnual === 0) return agregar(d, 4, "No cobra interés: conviene pagarla normal y abonar a las demás.");
      agregar(d, 3, d.penalidad > 0
        ? `Costo real ${costoTexto(d)} al año, pero cobra ${(d.penalidad * 100).toFixed(1)} % por abonar antes, por eso baja de prioridad.`
        : `Costo real ${costoTexto(d)} al año${d.seguroMensual > 0 ? ` (tasa ${(d.tasaAnual * 100).toFixed(1)} % + seguros)` : ""}.`);
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
  /** Saldo de cada deuda al terminar el mes. */
  saldos: Record<string, number>;
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
      alFondo: r2(alFondo), saldadas, saldos: Object.fromEntries(deudas.map((d) => [d.id, r2(d.saldo)])),
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

/** Lo que hace falta para dejar una deuda en cero este mes, después de su pago normal. */
export function montoParaSaldar(d: Deuda): number {
  if (d.saldo <= 0.005) return 0;
  const despuesDelPago = d.saldo + d.saldo * (d.tasaAnual / 12) + d.seguroMensual - pagoExigible(d);
  return r2(Math.max(despuesDelPago, 0) * (1 + d.penalidad));
}

export interface AccionAbono {
  id: string;
  nombre: string;
  tipo: Deuda["tipo"];
  aplicado: number;          // dinero del abono que va a esta deuda
  saldoAntes: number;        // saldo hoy
  saldoDespues: number;      // saldo después del pago normal + el abono
  saldada: boolean;
  salioDeSobregiro: boolean;
  libera: number;            // pago mensual que deja de existir si se salda
}

export interface PlanAbono {
  monto: number;
  acciones: AccionAbono[];
  sobrante: number;          // si alcanza para todo
  liberaTotal: number;       // dinero mensual que queda libre
  /** Deudas que este monto alcanza para saldar por completo, cada una por separado. */
  alcanzaPara: { id: string; nombre: string; monto: number; libera: number; enElPlan: boolean }[];
  /** Si no alcanza para saldar ninguna: la más cercana. */
  masCercana: { id: string; nombre: string; falta: number } | null;
  ahorroCostos: number;      // intereses y seguros que te ahorras con este abono
  mesesMenos: number | null; // cuánto antes terminas
}

/**
 * ¿Qué hago con este dinero? Reparte el monto según la estrategia (como abono
 * único este mes) y explica a dónde va, qué se salda, qué se libera y qué ganas.
 */
export function planDeAbono(deudas: Deuda[], monto: number, op: Omit<OpcionesSimulacion, "abonoInicial">): PlanAbono {
  const base = { ...op, fondo: undefined };
  const mes1 = simular(deudas, { ...base, extraMensual: 0, abonoInicial: monto, maxMeses: 1 }).meses[0];
  const acciones: AccionAbono[] = [];
  for (const d of deudas) {
    const aplicado = mes1?.extraAplicado[d.id] ?? 0;
    if (aplicado <= 0) continue;
    const saldoDespues = mes1.saldos[d.id] ?? 0;
    acciones.push({
      id: d.id, nombre: d.nombre, tipo: d.tipo, aplicado, saldoAntes: r2(d.saldo), saldoDespues,
      saldada: saldoDespues <= 0.005,
      salioDeSobregiro: sobregiro(d) > 0 && d.limite !== null && saldoDespues <= d.limite,
      libera: saldoDespues <= 0.005 ? r2(pagoBase(d)) : 0,
    });
  }
  // Orden en que se aplicó el dinero
  const orden = Object.keys(mes1?.extraAplicado ?? {});
  acciones.sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id));

  const usado = acciones.reduce((s, a) => s + a.aplicado, 0);
  const enElPlan = new Set(acciones.filter((a) => a.saldada).map((a) => a.id));
  const vivas = deudas.filter((d) => d.saldo > 0.005);
  const alcanzaPara = vivas
    .map((d) => ({ id: d.id, nombre: d.nombre, monto: montoParaSaldar(d), libera: r2(pagoBase(d)), enElPlan: enElPlan.has(d.id) }))
    .filter((x) => x.monto <= monto + 0.005)
    .sort((a, b) => b.libera / Math.max(b.monto, 1) - a.libera / Math.max(a.monto, 1));
  const cercana = alcanzaPara.length ? null : vivas
    .map((d) => ({ id: d.id, nombre: d.nombre, falta: r2(montoParaSaldar(d) - monto) }))
    .sort((a, b) => a.falta - b.falta)[0] ?? null;

  const sin = simular(deudas, { ...op, abonoInicial: 0 });
  const con = simular(deudas, { ...op, abonoInicial: monto });
  return {
    monto,
    acciones,
    sobrante: r2(Math.max(monto - usado, 0)),
    liberaTotal: r2(acciones.reduce((s, a) => s + a.libera, 0)),
    alcanzaPara,
    masCercana: cercana,
    ahorroCostos: sin.mesLibre === null && con.mesLibre === null ? 0 : r2(sin.totalCostos - con.totalCostos),
    mesesMenos: sin.mesLibre !== null && con.mesLibre !== null ? sin.mesLibre - con.mesLibre : null,
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
