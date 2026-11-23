import { describe, expect, it } from "vitest";
import type { EstadoExtraido } from "./claude";
import { conceptoDe, construirPropuestas, patronDe, type Contexto } from "./propuestas";

const estado: EstadoExtraido = {
  banco: "Banco Ejemplo", tipo_documento: "tarjeta_credito", fecha_corte: "2026-11-10", fecha_limite_pago: "2026-12-05",
  saldos: [{ moneda: "DOP", saldo_al_corte: 48250.75, pago_minimo: 3120 }],
  movimientos: [
    { fecha: "2026-10-12", descripcion: "PEDIDOS YA SANTO DOMINGO", monto: 815, moneda: "DOP", sentido: "debito", tipo: "compra", categoria: "Alimentación" },
    { fecha: "2026-10-15", descripcion: "SUPERMERCADO NACIONAL 0023", monto: 6432.1, moneda: "DOP", sentido: "debito", tipo: "compra", categoria: "Alimentación" },
    { fecha: "2026-10-20", descripcion: "SU PAGO GRACIAS", monto: 5000, moneda: "DOP", sentido: "credito", tipo: "pago_tarjeta", categoria: null },
    { fecha: "2026-11-10", descripcion: "INTERESES FINANCIAMIENTO", monto: 1563.2, moneda: "DOP", sentido: "debito", tipo: "interes_comision", categoria: null },
    { fecha: "2026-10-25", descripcion: "AMAZON PRIME", monto: 14.99, moneda: "USD", sentido: "debito", tipo: "compra", categoria: "Entretenimiento" },
    { fecha: "2026-10-28", descripcion: "DEVOLUCION TIENDA", monto: 300, moneda: "DOP", sentido: "credito", tipo: "devolucion", categoria: null },
  ],
};

const ctx: Contexto = {
  origen: { tipo: "tarjeta", id: "bsc-rd" },
  categorias: [
    { id: "ali", nombre: "Alimentación", tipo: "gasto" }, { id: "ent", nombre: "Entretenimiento", tipo: "gasto" },
    { id: "sal", nombre: "Salario", tipo: "ingreso" }, { id: "viv", nombre: "Vivienda", tipo: "gasto" },
  ],
  tarjetas: [
    { id: "bsc-rd", nombre: "Tarjeta Credito BSC Pesos", moneda: "DOP", persona_id: "fer" },
    { id: "isi", nombre: "Tarjeta Credito ISI", moneda: "DOP", persona_id: "ang" },
    { id: "bsc-us", nombre: "Tarjeta Credito BSC Dolares", moneda: "USD", persona_id: "fer" },
  ],
  prestamos: [{ id: "veh", acreedor: "Banreserva", descripcion: "Préstamo de Vehículo" }],
  reglas: [{ patron: "PEDIDOS YA SANTO", accion: "gasto_tarjeta", categoria_id: "ent", tarjeta_id: null, prestamo_id: null }],
  existentes: [{ fecha: "2026-10-19", montoRD: 5000, concepto: "Pago TC BSC" }],
  tasaCambio: 60.95,
  miPersonaId: "ang",
};

describe("patrones y conceptos", () => {
  it("normaliza el comercio", () => {
    expect(patronDe("SUPERMERCADO NACIONAL 0023")).toBe("SUPERMERCADO NACIONAL");
    expect(patronDe("Farmacia Carol #12")).toBe("FARMACIA CAROL");
  });
  it("limpia el concepto", () => {
    expect(conceptoDe("SUPERMERCADO NACIONAL 0023")).toBe("Supermercado Nacional");
  });
});

describe("propuestas desde estado de tarjeta", () => {
  const f = construirPropuestas(estado, ctx);
  it("compra → compra con tarjeta, con la categoría sugerida y el dueño de la tarjeta", () => {
    expect(f[1]).toMatchObject({ accion: "gasto_tarjeta", categoria_id: "ali", tarjeta_id: "bsc-rd", persona_id: "fer", concepto: "Supermercado Nacional" });
  });
  it("una regla aprendida cambia la categoría", () => {
    expect(f[0]).toMatchObject({ accion: "gasto_tarjeta", categoria_id: "ent", origenSugerencia: "regla" });
  });
  it("detecta el pago ya registrado como duplicado", () => {
    expect(f[2]).toMatchObject({ accion: "ignorar", origenSugerencia: "duplicado" });
    expect(f[2].duplicado).toContain("Pago TC BSC");
  });
  it("intereses → cargo a la tarjeta", () => {
    expect(f[3].accion).toBe("cargo_tarjeta");
  });
  it("compra en US$ va a la tarjeta en dólares del mismo banco", () => {
    expect(f[4]).toMatchObject({ accion: "gasto_tarjeta", tarjeta_id: "bsc-us", moneda: "USD", categoria_id: "ent" });
  });
  it("devolución → abono a la tarjeta", () => {
    expect(f[5].accion).toBe("abono_tarjeta");
  });
});

describe("propuestas desde cuenta bancaria", () => {
  const cuenta: EstadoExtraido = { ...estado, tipo_documento: "cuenta_bancaria", movimientos: [
    { fecha: "2026-11-15", descripcion: "NOMINA EMPRESA XYZ", monto: 21443.22, moneda: "DOP", sentido: "credito", tipo: "ingreso", categoria: "Salario" },
    { fecha: "2026-11-16", descripcion: "PAGO TARJETA ISI", monto: 5000, moneda: "DOP", sentido: "debito", tipo: "pago_tarjeta", categoria: null },
    { fecha: "2026-11-17", descripcion: "PAGO PRESTAMO BANRESERVA", monto: 21588, moneda: "DOP", sentido: "debito", tipo: "cuota_prestamo", categoria: null },
    { fecha: "2026-11-18", descripcion: "TRANSF A CUENTA PROPIA", monto: 1000, moneda: "DOP", sentido: "debito", tipo: "transferencia", categoria: null },
  ]};
  const f = construirPropuestas(cuenta, { ...ctx, origen: { tipo: "cuenta", id: "popular" }, reglas: [], existentes: [] });
  it("nómina → ingreso Salario", () => expect(f[0]).toMatchObject({ accion: "ingreso", categoria_id: "sal" }));
  it("pago de tarjeta → identifica la tarjeta por el nombre", () => expect(f[1]).toMatchObject({ accion: "pago_tarjeta", tarjeta_id: "isi" }));
  it("cuota → identifica el préstamo por el acreedor", () => expect(f[2]).toMatchObject({ accion: "cuota_prestamo", prestamo_id: "veh" }));
  it("transferencia propia → ignorar", () => expect(f[3].accion).toBe("ignorar"));
});
