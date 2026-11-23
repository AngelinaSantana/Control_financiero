import { describe, expect, it } from "vitest";
import { sumarMeses, diasEntre } from "../fechas";
import type { Prestamo, Tarjeta, Categoria, Gasto, Ingreso } from "../tipos";
import { amortizacion, estadoPrestamo, calendarioDeuda } from "./prestamos";
import { estadoTarjeta, mesesParaSaldar } from "./tarjetas";
import { resumenAnual, desviaciones } from "./resumen";

const vehiculo: Prestamo = {
  id: "veh", acreedor: "Banreserva", descripcion: "Préstamo de Vehículo", persona_id: null,
  fecha_inicio: "2026-05-28", fecha_primera_cuota: "2026-06-28", monto_original: 932000,
  tasa_anual: 0.114, base_dias: 365, cuotas_totales: 72, cuota_total: 21588, seguro_cuota: 3656.71,
  saldo_referencia: null, cuotas_pagadas_referencia: 0, fecha_referencia: null, activo: true,
};

const qik: Prestamo = {
  ...vehiculo, id: "qik", acreedor: "QIK", fecha_inicio: "2026-01-20", fecha_primera_cuota: "2026-03-16",
  monto_original: 50000, tasa_anual: 0.2445, base_dias: 360, cuotas_totales: 11, cuota_total: 5853.89,
  seguro_cuota: 174, saldo_referencia: 16572.11, cuotas_pagadas_referencia: 8, fecha_referencia: "2026-10-31",
};

describe("fechas", () => {
  it("suma meses ajustando a fin de mes", () => {
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(sumarMeses("2026-11-28", 2)).toBe("2027-01-28");
  });
  it("cuenta días reales", () => {
    expect(diasEntre("2026-05-28", "2026-06-28")).toBe(31);
    expect(diasEntre("2026-06-28", "2026-07-28")).toBe(30);
  });
});

describe("amortización por días (igual a hoja Amort_1)", () => {
  const filas = amortizacion(vehiculo);
  it("primera cuota", () => {
    expect(filas[0]).toMatchObject({ n: 1, dias: 31, interes: 9023.8, capital: 8907.49, saldoFinal: 923092.51 });
  });
  it("segunda cuota", () => {
    expect(filas[1]).toMatchObject({ n: 2, dias: 30, interes: 8649.25, capital: 9282.04, saldoFinal: 913810.47 });
  });
  it("termina en saldo cero", () => {
    expect(filas.at(-1)!.saldoFinal).toBe(0);
  });
  it("un abono extra acorta el plazo", () => {
    const con = amortizacion(vehiculo, { abonoMensual: 5000 });
    expect(con.length).toBeLessThan(filas.length);
  });
});

describe("estado de préstamo desde foto de referencia", () => {
  it("QIK: le quedan 3 cuotas", () => {
    const e = estadoPrestamo(qik, []);
    expect(e.cuotasPagadas).toBe(8);
    expect(e.cuotasRestantes).toBe(3);
    expect(e.saldoActual).toBe(16572.11);
    expect(e.alertas).toEqual([]);
  });
  it("pagos enlazados divididos en dos quincenas cuentan como una cuota", () => {
    const e = estadoPrestamo(qik, [
      { fecha: "2026-11-05", monto: 2926.95 },
      { fecha: "2026-11-15", monto: 2926.94 },
      { fecha: "2026-10-01", monto: 5853.89 }, // anterior a la foto: no cuenta
    ]);
    expect(e.cuotasPagadas).toBe(9);
    expect(e.cuotasRestantes).toBe(2);
    expect(e.saldoActual).toBeLessThan(16572.11);
  });
  it("calendario agrupa cuotas por mes", () => {
    const cal = calendarioDeuda([estadoPrestamo(qik, [])]);
    expect(cal.map((m) => m.clave)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(cal[2].terminan).toEqual(["qik"]);
  });
});

describe("tarjetas (hoja Tarjetas)", () => {
  it("meses para saldar ISI ≈ 12.9", () => {
    expect(mesesParaSaldar(51896.07, 5000, 0.4 / 12)).toBeCloseTo(12.949, 2);
  });
  it("pago que no cubre intereses", () => {
    expect(mesesParaSaldar(100000, 1000, 0.05)).toBe(Infinity);
  });
  it("compras 'pagado con' suben el saldo; en tarjetas US$ se convierten", () => {
    const t: Tarjeta = {
      id: "u", nombre: "BSC US$", persona_id: null, moneda: "USD", limite: 400, tasa_anual: 0.6,
      dia_corte: 8, dia_pago: 5, pago_minimo: 40, pago_programado: 50,
      saldo_referencia: 100, fecha_referencia: "2026-10-31", activa: true,
    };
    const e = estadoTarjeta(t, [], [{ fecha: "2026-11-05", monto: 1219 }], 60.95,
      [{ fecha: "2026-11-02", monto: 3047.5 }, { fecha: "2026-10-30", monto: 999 }]);
    expect(e.saldo).toBe(130); // 100 + 50 (3047.50 RD$) − 20 (1219 RD$); la compra anterior a la foto no cuenta
  });
  it("saldo, sobregiro e interés", () => {
    const t: Tarjeta = {
      id: "t", nombre: "ISI", persona_id: null, moneda: "DOP", limite: 52000, tasa_anual: 0.4,
      dia_corte: 10, dia_pago: 5, pago_minimo: 3581.74, pago_programado: 5000,
      saldo_referencia: 51896.07, fecha_referencia: "2026-10-31", activa: true,
    };
    const e = estadoTarjeta(t, [
      { id: "1", tarjeta_id: "t", fecha: "2026-11-02", tipo: "consumo", monto: 1000, descripcion: null },
    ], [{ fecha: "2026-11-05", monto: 500 }], 60.95);
    expect(e.saldo).toBe(52396.07);
    expect(e.sobregiro).toBe(396.07);
    expect(e.saldoFinanciado).toBe(47396.07);
    expect(e.interesEstimado).toBeCloseTo(1579.87, 2);
  });
});

describe("resumen y desviaciones", () => {
  const cats: Categoria[] = [
    { id: "viv", nombre: "Vivienda", tipo: "gasto", orden: 1 },
    { id: "deu", nombre: "Deuda - Préstamos", tipo: "gasto", orden: 2 },
  ];
  const base = { persona_id: null, cuenta_id: null, quincena: "N/A" as const, notas: null };
  const gastos: Gasto[] = [
    { ...base, id: "g1", fecha: "2026-07-30", concepto: "Casa", categoria_id: "viv", tipo: "Fijo", monto: 20000, prestamo_id: null, tarjeta_id: null },
    { ...base, id: "g2", fecha: "2026-07-13", concepto: "Vehículo", categoria_id: "deu", tipo: "Fijo", monto: "10794", prestamo_id: null, tarjeta_id: null },
  ];
  const ingresos: Ingreso[] = [
    { ...base, id: "i1", fecha: "2026-07-15", concepto: "Salario", categoria_id: null, tipo: "Fijo", monto: 50000 },
  ];
  it("calcula flujo, servicio de deuda y tasa de ahorro", () => {
    const r = resumenAnual(2026, ingresos, gastos, [
      { id: "a", fondo_id: "f", fecha: "2026-07-20", persona_id: null, tipo: "aporte", monto: 5000, cuenta_id: null, notas: null },
    ], cats);
    const jul = r.meses[6];
    expect(jul.gastos).toBe(30794);
    expect(jul.servicioDeuda).toBe(10794);
    expect(jul.flujoNeto).toBe(19206);
    expect(jul.tasaAhorro).toBeCloseTo(0.1);
    expect(jul.sinFondo).toBe(14206);
  });
  it("un pago a tarjeta no suma como gasto pero sí como servicio de deuda", () => {
    const conPago: Gasto[] = [...gastos,
      { ...base, id: "g3", fecha: "2026-07-20", concepto: "Pago TC ISI", categoria_id: null, tipo: "Variable", monto: 5000, prestamo_id: null, tarjeta_id: "isi" },
      { ...base, id: "g4", fecha: "2026-07-21", concepto: "Super con ISI", categoria_id: "viv", tipo: "Variable", monto: 1000, prestamo_id: null, tarjeta_id: null, pagado_con_tarjeta_id: "isi" },
    ];
    const jul = resumenAnual(2026, ingresos, conPago, [], cats).meses[6];
    expect(jul.gastos).toBe(31794);          // 30794 + compra con tarjeta; el pago no suma
    expect(jul.pagosTarjetas).toBe(5000);
    expect(jul.servicioDeuda).toBe(15794);   // préstamo 10794 + pago tarjeta 5000
    const d = desviaciones(2026, cats, [], [], conPago);
    expect(d.find((f) => f.categoriaId === "viv")!.real[6]).toBe(21000);
    expect(d.find((f) => f.categoriaId === "")).toBeUndefined();
  });
  it("compara planeado vs real", () => {
    const d = desviaciones(2026, cats,
      [{ id: "c1", categoria_id: "viv", concepto: "Casa", tipo: "Fijo", persona_id: null, quincena: "Q2", cuenta_id: null, activo: true, orden: 1 }],
      [{ concepto_id: "c1", anio: 2026, mes: 7, monto: 21200 }], gastos);
    const viv = d.find((f) => f.categoriaId === "viv")!;
    expect(viv.planeado[6]).toBe(21200);
    expect(viv.real[6]).toBe(20000);
  });
});
