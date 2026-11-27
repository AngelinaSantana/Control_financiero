import { describe, expect, it } from "vitest";
import {
  costoEfectivoAnual, diagnosticar, montoParaSaldar, ordenRecomendado, planDeAbono, simular, simularActual,
  simularConsolidacion, type Deuda,
} from "./analisis";

const d = (x: Partial<Deuda> & { id: string }): Deuda => ({
  nombre: x.id, tipo: "prestamo", saldo: 10000, tasaAnual: 0.24, pagoMinimo: 1000, seguroMensual: 0, limite: null, penalidad: 0, ...x,
});

describe("costos", () => {
  it("el costo efectivo suma los seguros fijos a la tasa", () => {
    const veh = d({ id: "veh", saldo: 898047.25, tasaAnual: 0.114, seguroMensual: 3656.71 });
    expect(costoEfectivoAnual(veh)).toBeCloseTo(0.1629, 3);
  });
});

describe("simulación", () => {
  it("préstamo al 0 %: 12 cuotas exactas, sin costo", () => {
    const r = simularActual([d({ id: "a", saldo: 12000, tasaAnual: 0 })]);
    expect(r.mesLibre).toBe(12);
    expect(r.totalCostos).toBe(0);
  });
  it("al 24 % con RD$1,000 al mes tarda 12 meses (11.27 por fórmula)", () => {
    const r = simularActual([d({ id: "a" })]);
    expect(r.mesLibre).toBe(12);
    expect(r.totalCostos).toBeGreaterThan(1100);
    expect(r.totalCostos).toBeLessThan(1300);
  });
  it("el dinero extra acorta el plazo y baja los intereses", () => {
    const deudas = [d({ id: "a" }), d({ id: "b", saldo: 30000, tasaAnual: 0.6, pagoMinimo: 1600, tipo: "tarjeta", limite: 40000 })];
    const base = simularActual(deudas);
    const con = simular(deudas, { estrategia: "recomendada", extraMensual: 3000, abonoInicial: 0, reinvertirLiberado: true });
    expect(con.mesLibre!).toBeLessThan(base.mesLibre!);
    expect(con.totalCostos).toBeLessThan(base.totalCostos);
  });
  it("detecta cuando el pago no cubre los intereses", () => {
    const r = simularActual([d({ id: "t", saldo: 100000, tasaAnual: 0.6, pagoMinimo: 4000, tipo: "tarjeta" })]);
    expect(r.noAlcanza).toBe(true);
    expect(r.mesLibre).toBeNull();
  });
  it("con fondo de emergencia reserva una parte del extra hasta la meta", () => {
    const r = simular([d({ id: "a", saldo: 50000 })], {
      estrategia: "recomendada", extraMensual: 4000, abonoInicial: 0, reinvertirLiberado: true,
      fondo: { saldo: 0, meta: 3000, porcentaje: 0.25 },
    });
    expect(r.meses[0].alFondo).toBe(1000);
    expect(r.meses[2].alFondo).toBe(1000);
    expect(r.meses[3].alFondo).toBe(0);
  });
});

describe("orden recomendado (más que avalancha o bola de nieve)", () => {
  const deudas = [
    d({ id: "vehiculo", saldo: 898047, tasaAnual: 0.114, pagoMinimo: 21588, seguroMensual: 3656 }),
    d({ id: "qik", saldo: 11241, tasaAnual: 0.2445, pagoMinimo: 5853 }),
    d({ id: "avance", saldo: 208541, tasaAnual: 0, pagoMinimo: 2291 }),
    d({ id: "isi", tipo: "tarjeta", saldo: 51896, tasaAnual: 0.4, pagoMinimo: 5000, limite: 52000 }),
    d({ id: "banreservas", tipo: "tarjeta", saldo: 36638, tasaAnual: 0.6, pagoMinimo: 1988, limite: 31000 }),
    d({ id: "credimas", saldo: 23696, tasaAnual: 0.3, pagoMinimo: 4514, penalidad: 0.05 }),
  ];
  const orden = ordenRecomendado(deudas, 15000);
  const puesto = (id: string) => orden.find((p) => p.id === id)!.puesto;
  it("primero la tarjeta en sobregiro", () => {
    expect(orden[0].id).toBe("banreservas");
    expect(orden[0].motivo).toContain("sobregiro");
  });
  it("luego lo que se puede saldar ya y libera mucho flujo (QIK libera RD$5,853 con ~RD$11k)", () => {
    expect(puesto("qik")).toBe(2);
    expect(orden[1].motivo).toContain("libera");
  });
  it("la deuda al 0 % va al final", () => {
    expect(orden.at(-1)!.id).toBe("avance");
  });
  it("la penalidad por pago anticipado baja la prioridad", () => {
    expect(puesto("isi")).toBeLessThan(puesto("credimas"));
  });
  it("en la simulación recomendada, el extra baja primero el sobregiro hasta el límite", () => {
    const r = simular(deudas, { estrategia: "recomendada", extraMensual: 15000, abonoInicial: 0, reinvertirLiberado: true, maxMeses: 1 });
    expect(r.meses[0].extraAplicado.banreservas).toBeGreaterThan(5000);
  });
  it("la recomendada termina antes o igual y cuesta no más que la bola de nieve", () => {
    const op = { extraMensual: 15000, abonoInicial: 0, reinvertirLiberado: true };
    const rec = simular(deudas, { ...op, estrategia: "recomendada" });
    const bola = simular(deudas, { ...op, estrategia: "bola_nieve" });
    expect(rec.totalCostos).toBeLessThanOrEqual(bola.totalCostos);
  });
});

describe("diagnóstico y consolidación", () => {
  const deudas = [
    d({ id: "isi", nombre: "ISI", tipo: "tarjeta", saldo: 51896, tasaAnual: 0.4, pagoMinimo: 5000, limite: 52000 }),
    d({ id: "br", nombre: "Banreservas", tipo: "tarjeta", saldo: 36638, tasaAnual: 0.6, pagoMinimo: 1988, limite: 31000 }),
    d({ id: "pop", nombre: "Consolidación Popular", saldo: 87033, tasaAnual: 0.23, pagoMinimo: 3450 }),
    d({ id: "apap", nombre: "APAP Boda", saldo: 184895, tasaAnual: 0.07, pagoMinimo: 1985 }),
  ];
  it("alerta sobregiro, uso alto de tarjetas y oportunidad de consolidar", () => {
    const dx = diagnosticar(deudas, 80000, 0.3);
    const textos = dx.alertas.map((a) => a.texto).join(" | ");
    expect(textos).toContain("sobregiro");
    expect(textos).toContain("límite de tus tarjetas");
    expect(textos).toContain("Consolidación Popular (23 %)");
    expect(textos).not.toContain("APAP");
    expect(dx.costoMensual).toBeGreaterThan(3000);
  });
  it("consolidar tarjetas al 60 % en un préstamo al 24 % ahorra intereses", () => {
    const c = simularConsolidacion(deudas.filter((x) => x.tipo === "tarjeta"), 0.24, 36)!;
    expect(c.monto).toBeCloseTo(88534, 0);
    expect(c.ahorro).toBeGreaterThan(0);
    expect(c.tarjetasTerminan).toBe(true);
  });
  it("si la cuota no cubre los intereses de las tarjetas, lo dice en vez de dar una cifra absurda", () => {
    const caras = [d({ id: "t", tipo: "tarjeta", saldo: 300000, tasaAnual: 0.6, pagoMinimo: 9000, limite: 290000 })];
    const c = simularConsolidacion(caras, 0.24, 48)!; // cuota ~9,780 < interés de la tarjeta (15,000)
    expect(c.tarjetasTerminan).toBe(false);
    expect(c.costoConsolidado).toBeGreaterThan(0);
  });
  it("una tarjeta sin pago mínimo registrado usa un pago estimado", () => {
    const t = d({ id: "acap", tipo: "tarjeta", saldo: 68753, tasaAnual: 0.6, pagoMinimo: 0, limite: 68000 });
    expect(diagnosticar([t], 80000, 0.3).pagosMinimos).toBeGreaterThan(4000);
  });
});

describe("plan de abono: qué hacer con un dinero extra", () => {
  const deudas = [
    d({ id: "br", nombre: "Banreservas", tipo: "tarjeta", saldo: 36638, tasaAnual: 0.6, pagoMinimo: 1988, limite: 31000 }),
    d({ id: "ultra", nombre: "Ultracrédito", saldo: 8983, tasaAnual: 0.265, pagoMinimo: 1094 }),
    d({ id: "pm", nombre: "Pricesmart Pesos", tipo: "tarjeta", saldo: 6770, tasaAnual: 0.6, pagoMinimo: 1829, limite: 6095 }),
    d({ id: "isi", nombre: "ISI", tipo: "tarjeta", saldo: 47896, tasaAnual: 0.4, pagoMinimo: 5000, limite: 52000 }),
    d({ id: "avance", nombre: "Avance a sueldo", saldo: 208541, tasaAnual: 0, pagoMinimo: 2292 }),
  ];
  const op = { estrategia: "recomendada" as const, extraMensual: 0, reinvertirLiberado: true };
  const plan = planDeAbono(deudas, 55000, op);
  const accion = (id: string) => plan.acciones.find((a) => a.id === id);

  it("reparte todo el dinero y dice qué deudas quedan saldadas", () => {
    expect(plan.acciones.reduce((s, a) => s + a.aplicado, 0)).toBeCloseTo(55000, 0);
    expect(accion("pm")?.saldada).toBe(true);
    expect(accion("ultra")?.saldada).toBe(true);
    expect(plan.liberaTotal).toBeGreaterThan(2900); // 1,829 + 1,094 al mes
  });
  it("saca primero las tarjetas del sobregiro", () => {
    expect(plan.acciones[0].salioDeSobregiro || plan.acciones[0].saldada).toBe(true);
    expect(accion("br")?.salioDeSobregiro).toBe(true);
  });
  it("lista todas las deudas que alcanzaría para saldar completas", () => {
    const ids = plan.alcanzaPara.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["pm", "ultra", "br", "isi"]));
    expect(ids).not.toContain("avance");
  });
  it("calcula cuánto ahorras y cuánto antes terminas", () => {
    expect(plan.ahorroCostos).toBeGreaterThan(0);
    expect(plan.mesesMenos).toBeGreaterThan(0);
  });
  it("si no alcanza para saldar ninguna, dice cuál es la más cercana y cuánto falta", () => {
    const poco = planDeAbono(deudas, 3000, op);
    expect(poco.alcanzaPara).toHaveLength(0);
    expect(poco.masCercana?.id).toBe("pm");
    expect(poco.masCercana!.falta).toBeGreaterThan(0);
  });
  it("monto para saldar descuenta el pago normal del mes", () => {
    const x = d({ id: "x", saldo: 10000, tasaAnual: 0, pagoMinimo: 1000 });
    expect(montoParaSaldar(x)).toBe(9000);
  });
});
