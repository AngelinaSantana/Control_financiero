// Tipos que reflejan las tablas de supabase/migrations/0001_esquema.sql.
// Supabase devuelve numeric como number o string según el caso: usar num().

export type TipoMov = "Fijo" | "Variable" | "Pago único";
export type Quincena = "Q1" | "Q2" | "Ambas" | "N/A";
export type Num = number | string;

export const TIPOS_MOV: TipoMov[] = ["Fijo", "Variable", "Pago único"];
export const QUINCENAS: { valor: Quincena; etiqueta: string }[] = [
  { valor: "Q1", etiqueta: "Q1 (15)" },
  { valor: "Q2", etiqueta: "Q2 (30)" },
  { valor: "Ambas", etiqueta: "Ambas" },
  { valor: "N/A", etiqueta: "N/A" },
];

export interface Hogar {
  id: string;
  nombre: string;
  codigo_invitacion: string;
  anio_trabajo: number;
  meta_ahorro: Num;
  limite_deuda: Num;
  meses_fondo_emergencia: Num;
  tasa_cambio_usd: Num;
}

export interface Persona { id: string; nombre: string; es_compartido: boolean; orden: number }
export interface Cuenta { id: string; nombre: string; activa: boolean }
export interface Categoria { id: string; nombre: string; tipo: "gasto" | "ingreso"; orden: number }

export interface Movimiento {
  id: string;
  fecha: string; // YYYY-MM-DD
  persona_id: string | null;
  concepto: string;
  categoria_id: string | null;
  tipo: TipoMov;
  cuenta_id: string | null;
  quincena: Quincena;
  monto: Num;
  notas: string | null;
}

export interface Gasto extends Movimiento {
  prestamo_id: string | null;
  tarjeta_id: string | null;
}
export type Ingreso = Movimiento;

export interface Prestamo {
  id: string;
  acreedor: string;
  descripcion: string;
  persona_id: string | null;
  fecha_inicio: string;
  fecha_primera_cuota: string;
  monto_original: Num;
  tasa_anual: Num;
  base_dias: 360 | 365;
  cuotas_totales: number;
  cuota_total: Num;
  seguro_cuota: Num;
  saldo_referencia: Num | null;
  cuotas_pagadas_referencia: number;
  fecha_referencia: string | null;
  activo: boolean;
}

export interface AbonoPrestamo { id: string; prestamo_id: string; fecha: string; monto: Num; notas: string | null }

export interface Tarjeta {
  id: string;
  nombre: string;
  persona_id: string | null;
  moneda: "DOP" | "USD";
  limite: Num;
  tasa_anual: Num;
  dia_corte: number | null;
  dia_pago: number | null;
  pago_minimo: Num | null;
  pago_programado: Num | null;
  saldo_referencia: Num;
  fecha_referencia: string;
  activa: boolean;
}

export interface MovTarjeta {
  id: string;
  tarjeta_id: string;
  fecha: string;
  tipo: "consumo" | "pago" | "cargo";
  monto: Num;
  descripcion: string | null;
}

export interface ConceptoPresupuesto {
  id: string;
  categoria_id: string;
  concepto: string;
  tipo: TipoMov;
  persona_id: string | null;
  quincena: Quincena;
  cuenta_id: string | null;
  activo: boolean;
  orden: number;
}
export interface MontoPresupuesto { concepto_id: string; anio: number; mes: number; monto: Num }

export interface FondoAhorro { id: string; nombre: string; meta: Num | null; persona_id: string | null; orden: number }
export interface MovAhorro {
  id: string;
  fondo_id: string;
  fecha: string;
  persona_id: string | null;
  tipo: "aporte" | "retiro";
  monto: Num;
  cuenta_id: string | null;
  notas: string | null;
}

export interface PrestamoPersonal {
  id: string;
  contraparte: string;
  direccion: "me_deben" | "debo";
  persona_id: string | null;
  monto: Num;
  fecha: string;
  fecha_limite: string | null;
  notas: string | null;
}
export interface PagoPersonal { id: string; prestamo_personal_id: string; fecha: string; monto: Num; notas: string | null }

export const num = (v: Num | null | undefined): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
