import { describe, expect, it } from "vitest";
import { coincideNombre, estadoCategoria, fijosSinPresupuesto } from "./presupuesto";
import type { Gasto } from "./tipos";

const conceptos = [
  "Casa (Alquiler)", "Luz", "Internet", "Teléfono F", "Teléfono A", "Pago del vehículo",
  "Préstamo QIK", "Avance a sueldo", "Google one", "Netflix", "Consumo de agua",
].map((concepto) => ({ concepto }));

describe("coincidencia de nombres con el presupuesto", () => {
  it.each([
    ["Casa", "Casa (Alquiler)"],
    ["Telefono A", "Teléfono A"],
    ["1era parte Vehiculo", "Pago del vehículo"],
    ["Pago Prestamo Qik", "Préstamo QIK"],
    ["Google One", "Google one"],
  ])("“%s” coincide con “%s”", (gasto, concepto) => expect(coincideNombre(gasto, concepto)).toBe(true));

  it.each([
    ["Telefono F", "Teléfono A"],
    ["Edenorte", "Luz"],
    ["Seguro médico", "Casa (Alquiler)"],
  ])("“%s” NO coincide con “%s”", (gasto, concepto) => expect(coincideNombre(gasto, concepto)).toBe(false));
});

describe("fijos sin presupuesto", () => {
  const base = { persona_id: null, cuenta_id: null, quincena: "Q2" as const, notas: null, prestamo_id: null, tarjeta_id: null, categoria_id: "c" };
  const g = (id: string, concepto: string, fecha: string, monto: number, extra: Partial<Gasto> = {}): Gasto =>
    ({ ...base, id, concepto, fecha, monto, tipo: "Fijo", ...extra });
  const gastos: Gasto[] = [
    g("1", "Casa", "2026-10-30", 20000),
    g("2", "Seguro médico", "2026-10-05", 1800),
    g("3", "Seguro Medico", "2026-11-05", 1950),
    g("4", "Gimnasio", "2026-11-02", 1500, { tipo: "Variable" }),
    g("5", "Cuota vehículo nueva", "2026-11-10", 21588, { prestamo_id: "veh" }),
    g("6", "Pago TC ISI", "2026-11-12", 5000, { tarjeta_id: "isi" }),
  ];
  const r = fijosSinPresupuesto(gastos, conceptos);
  it("agrupa el mismo gasto de varios meses y toma el monto más reciente", () => {
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ concepto: "Seguro Medico", monto: 1950, veces: 2 });
  });
  it("ignora los ya presupuestados, los variables, las cuotas enlazadas y los pagos a tarjeta", () => {
    expect(r.map((x) => x.concepto)).not.toContain("Casa");
  });
});

describe("estado de una categoría", () => {
  it("clasifica según el uso del presupuesto", () => {
    expect(estadoCategoria(10000, 5000)).toBe("bien");
    expect(estadoCategoria(10000, 9000)).toBe("cerca");
    expect(estadoCategoria(10000, 12000)).toBe("excedido");
    expect(estadoCategoria(0, 500)).toBe("sin_presupuesto");
    expect(estadoCategoria(0, 0)).toBe("sin_gasto");
    expect(estadoCategoria(21200, 0)).toBe("sin_gasto");
  });
});
