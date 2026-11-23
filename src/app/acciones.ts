"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { contexto, mensajeBase } from "@/lib/datos";
import { sumarMeses } from "@/lib/fechas";
import { conceptoCoincidente, esFijoPresupuestable } from "@/lib/presupuesto";
import type { Gasto } from "@/lib/tipos";
import { crearClienteServidor } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Utilidades para leer formularios
// ---------------------------------------------------------------------
const txt = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opc = (fd: FormData, k: string) => txt(fd, k) || null;
const numero = (fd: FormData, k: string) => {
  const v = txt(fd, k).replace(/,/g, "");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const req = (fd: FormData, k: string, etiqueta: string) => {
  const v = txt(fd, k);
  if (!v) throw new ErrorUsuario(`Falta ${etiqueta}`);
  return v;
};
const reqNum = (fd: FormData, k: string, etiqueta: string) => {
  const v = numero(fd, k);
  if (v === null) throw new ErrorUsuario(`${etiqueta} debe ser un número`);
  return v;
};
const pct = (fd: FormData, k: string) => {
  const v = numero(fd, k);
  return v === null ? null : v / 100;
};

class ErrorUsuario extends Error {}

function destino(fd: FormData, porDefecto = "/") {
  const v = txt(fd, "volver");
  return v.startsWith("/") ? v : porDefecto;
}

function conParam(ruta: string, clave: string, valor: string, extra: Record<string, string> = {}) {
  const url = new URL(ruta, "http://x");
  for (const k of ["editar", "error", "ok", "sugerir", "nuevo"]) url.searchParams.delete(k);
  url.searchParams.set(clave, valor);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  return url.pathname + url.search;
}

type Resultado = string | void | { mensaje: string; params: Record<string, string> };

/** Ejecuta la acción; ante error vuelve con ?error=, si no, con ?ok=. */
async function ejecutar(fd: FormData, fn: () => Promise<Resultado>) {
  const volver = destino(fd);
  let resultado: Resultado;
  try {
    resultado = await fn();
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect interno de Next
    const msg = e instanceof Error ? e.message : "Error inesperado";
    redirect(conParam(volver, "error", msg));
  }
  revalidatePath("/", "layout");
  if (resultado && typeof resultado === "object") redirect(conParam(volver, "ok", resultado.mensaje, resultado.params));
  redirect(conParam(volver, "ok", resultado || "Guardado"));
}

function revisar<T extends { error: { message: string } | null }>(r: T): T {
  if (r.error) throw new Error(traducirError(r.error.message));
  return r;
}

function traducirError(m: string) {
  if (m.includes("pagado_con_tarjeta_id") || m.includes("penalidad_pago_anticipado")) return mensajeBase(m);
  if (m.includes("violates foreign key") || m.includes("restrict")) return "No se puede borrar: está en uso.";
  if (m.includes("duplicate key")) return "Ya existe un registro con ese nombre.";
  if (m.includes("Invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("Email not confirmed")) return "Confirma tu correo antes de entrar (revisa tu bandeja).";
  return m;
}

// ---------------------------------------------------------------------
// Autenticación y hogar
// ---------------------------------------------------------------------
export async function iniciarSesion(fd: FormData) {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: txt(fd, "email"), password: txt(fd, "password") });
  if (error) redirect(`/login?error=${encodeURIComponent(traducirError(error.message))}`);
  redirect("/");
}

export async function registrarse(fd: FormData) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signUp({ email: txt(fd, "email"), password: txt(fd, "password") });
  if (error) redirect(`/login?modo=registro&error=${encodeURIComponent(traducirError(error.message))}`);
  if (!data.session) redirect(`/login?ok=${encodeURIComponent("Te enviamos un correo para confirmar la cuenta.")}`);
  redirect("/hogar");
}

export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function crearHogar(fd: FormData) {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("crear_hogar", { p_nombre: txt(fd, "nombre") || "Mi hogar", p_mi_nombre: txt(fd, "mi_nombre") || "Yo" });
  if (error) redirect(`/hogar?error=${encodeURIComponent(traducirError(error.message))}`);
  redirect("/configuracion");
}

export async function unirseHogar(fd: FormData) {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("unirse_hogar", { p_codigo: txt(fd, "codigo"), p_mi_nombre: txt(fd, "mi_nombre") || "Yo" });
  if (error) redirect(`/hogar?error=${encodeURIComponent(traducirError(error.message))}`);
  redirect("/");
}

export async function actualizarHogar(fd: FormData) {
  await ejecutar(fd, async () => {
    const { supabase, hogarId } = await contexto();
    revisar(await supabase.from("hogares").update({
      nombre: req(fd, "nombre", "el nombre"),
      anio_trabajo: reqNum(fd, "anio_trabajo", "El año"),
      meta_ahorro: pct(fd, "meta_ahorro") ?? 0.2,
      limite_deuda: pct(fd, "limite_deuda") ?? 0.3,
      meses_fondo_emergencia: numero(fd, "meses_fondo_emergencia") ?? 3,
      tasa_cambio_usd: reqNum(fd, "tasa_cambio_usd", "La tasa de cambio"),
    }).eq("id", hogarId));
    return "Configuración guardada";
  });
}

// ---------------------------------------------------------------------
// Catálogos: personas, cuentas, categorías, fondos
// ---------------------------------------------------------------------
const CATALOGOS = ["personas", "cuentas", "categorias", "fondos_ahorro"] as const;

export async function agregarCatalogo(fd: FormData) {
  await ejecutar(fd, async () => {
    const { supabase, hogarId } = await contexto();
    const tabla = txt(fd, "tabla") as (typeof CATALOGOS)[number];
    if (!CATALOGOS.includes(tabla)) throw new Error("Catálogo no válido");
    const fila: Record<string, unknown> = { hogar_id: hogarId, nombre: req(fd, "nombre", "el nombre") };
    if (tabla === "categorias") fila.tipo = txt(fd, "tipo") === "ingreso" ? "ingreso" : "gasto";
    if (tabla === "fondos_ahorro") fila.meta = numero(fd, "meta");
    if (tabla === "personas") fila.es_compartido = fd.get("es_compartido") === "on";
    revisar(await supabase.from(tabla).insert(fila));
    return "Agregado";
  });
}

// ---------------------------------------------------------------------
// Borrado genérico
// ---------------------------------------------------------------------
const BORRABLES = [
  ...CATALOGOS, "ingresos", "gastos", "presupuesto_conceptos", "prestamos", "prestamo_abonos",
  "tarjetas", "tarjeta_movimientos", "ahorro_movimientos", "prestamos_personales", "prestamo_personal_pagos",
];

export async function eliminar(fd: FormData) {
  await ejecutar(fd, async () => {
    const { supabase } = await contexto();
    const tabla = txt(fd, "tabla");
    if (!BORRABLES.includes(tabla)) throw new Error("Tabla no válida");
    revisar(await supabase.from(tabla).delete().eq("id", req(fd, "id", "el id")));
    return "Eliminado";
  });
}

// ---------------------------------------------------------------------
// Ingresos y gastos
// ---------------------------------------------------------------------
export async function guardarMovimiento(fd: FormData) {
  await ejecutar(fd, async () => {
    const { supabase, hogarId } = await contexto();
    const tabla = txt(fd, "tabla") === "ingresos" ? "ingresos" : "gastos";
    const fila: Record<string, unknown> = {
      hogar_id: hogarId,
      fecha: req(fd, "fecha", "la fecha"),
      concepto: req(fd, "concepto", "el concepto"),
      monto: reqNum(fd, "monto", "El monto"),
      persona_id: opc(fd, "persona_id"),
      categoria_id: opc(fd, "categoria_id"),
      cuenta_id: opc(fd, "cuenta_id"),
      tipo: txt(fd, "tipo") || "Variable",
      quincena: txt(fd, "quincena") || "N/A",
      notas: opc(fd, "notas"),
    };
    if (tabla === "gastos") {
      fila.prestamo_id = opc(fd, "prestamo_id");
      fila.tarjeta_id = opc(fd, "tarjeta_id");
      const pagadoCon = opc(fd, "pagado_con_tarjeta_id");
      // Sólo se envía si se usa (o se está quitando), para no romper bases sin la migración 0003.
      if (pagadoCon || fd.get("tenia_pagado_con") === "1") fila.pagado_con_tarjeta_id = pagadoCon;
      if (pagadoCon && fila.tarjeta_id) {
        throw new ErrorUsuario("Un gasto no puede ser a la vez una compra con tarjeta y un pago a una tarjeta");
      }
    }
    const id = opc(fd, "id");
    if (id) {
      revisar(await supabase.from(tabla).update(fila).eq("id", id));
      return tabla === "ingresos" ? "Ingreso guardado" : "Gasto guardado";
    }
    const { data: nuevo } = revisar(await supabase.from(tabla).insert(fila).select("id").single());
    if (tabla === "ingresos") return "Ingreso guardado";

    // Un gasto Fijo nuevo que no está en el presupuesto: sugerir agregarlo.
    if (nuevo && esFijoPresupuestable(fila as Pick<Gasto, "tipo" | "prestamo_id" | "tarjeta_id">)) {
      const { data: conceptos } = await supabase.from("presupuesto_conceptos").select("concepto");
      if (!conceptoCoincidente(String(fila.concepto), conceptos ?? [])) {
        return { mensaje: "Gasto guardado", params: { sugerir: nuevo.id } };
      }
    }
    return "Gasto guardado";
  });
}

/**
 * Copia al mes siguiente los movimientos fijos elegidos (sueldo, alquiler,
 * cuotas…). Cada uno conserva el día del mes; el monto puede ajustarse.
 */
export async function copiarFijos(fd: FormData) {
  await ejecutar(fd, async () => {
    const { supabase, hogarId } = await contexto();
    const tabla = txt(fd, "tabla") === "ingresos" ? "ingresos" : "gastos";
    const ids = fd.getAll("ids").map(String).filter(Boolean);
    if (!ids.length) throw new ErrorUsuario("No marcaste ningún movimiento para copiar");

    const { data } = revisar(await supabase.from(tabla).select("*").in("id", ids));
    const filas = (data ?? []).map((m: Record<string, unknown>) => {
      const fila: Record<string, unknown> = {
        hogar_id: hogarId,
        fecha: sumarMeses(String(m.fecha), 1),
        persona_id: m.persona_id,
        concepto: m.concepto,
        categoria_id: m.categoria_id,
        tipo: m.tipo,
        cuenta_id: m.cuenta_id,
        quincena: m.quincena,
        monto: numero(fd, `monto_${m.id}`) ?? m.monto,
        notas: m.notas,
      };
      if (tabla === "gastos") {
        fila.prestamo_id = m.prestamo_id;
        fila.tarjeta_id = m.tarjeta_id;
        if (m.pagado_con_tarjeta_id) fila.pagado_con_tarjeta_id = m.pagado_con_tarjeta_id;
      }
      return fila;
    });
    if (!filas.length) throw new ErrorUsuario("No se encontraron los movimientos");
    revisar(await supabase.from(tabla).insert(filas));
    return `${filas.length} ${tabla === "ingresos" ? "ingreso(s)" : "gasto(s)"} copiado(s) al mes siguiente`;
  });
}

// ---------------------------------------------------------------------
// Presupuesto
// ---------------------------------------------------------------------
export async function guardarConcepto(fd: FormData) {
  await ejecutar(fd, async () => {
    const { supabase, hogarId } = await contexto();
    const fila = {
      hogar_id: hogarId,
      categoria_id: req(fd, "categoria_id", "la categoría"),
      concepto: req(fd, "concepto", "el concepto"),
      tipo: txt(fd, "tipo") || "Fijo",
      persona_id: opc(fd, "persona_id"),
      quincena: txt(fd, "quincena") || "N/A",
      cuenta_id: opc(fd, "cuenta_id"),
    };
    const id = opc(fd, "id");
    if (id) {
      revisar(await supabase.from("presupuesto_conceptos").update(fila).eq("id", id));
      return "Concepto actualizado";
    }
    const { data } = revisar(await supabase.from("presupuesto_conceptos").insert(fila).select("id").single());
    // Monto inicial: se replica en los meses elegidos del año
    const monto = numero(fd, "monto");
    const anio = numero(fd, "anio");
    const desde = numero(fd, "desde_mes") ?? 1;
    if (data && monto && anio) {
      const filas = Array.from({ length: 13 - desde }, (_, i) => ({
        hogar_id: hogarId, concepto_id: data.id, anio, mes: desde + i, monto,
      }));
      revisar(await supabase.from("presupuesto_montos").insert(filas));
    }
    return "Concepto agregado";
  });
}

/** Guardado inmediato desde la cuadrícula del presupuesto (sin redirección). */
export async function guardarMonto(conceptoId: string, anio: number, mes: number, monto: number) {
  const { supabase, hogarId } = await contexto();
  const r = monto
    ? await supabase.from("presupuesto_montos").upsert({ hogar_id: hogarId, concepto_id: conceptoId, anio, mes, monto })
    : await supabase.from("presupuesto_montos").delete().match({ concepto_id: conceptoId, anio, mes });
  if (r.error) return { error: r.error.message };
  revalidatePath("/presupuesto");
  return { ok: true };
}

export async function copiarMes(fd: FormData) {
  await ejecutar(fd, async () => {
    const { supabase, hogarId } = await contexto();
    const anio = reqNum(fd, "anio", "El año");
    const origen = reqNum(fd, "origen", "El mes origen");
    const destinoMes = reqNum(fd, "destino", "El mes destino");
    const { data } = revisar(await supabase.from("presupuesto_montos").select("concepto_id, monto").match({ anio, mes: origen }));
    if (!data?.length) throw new ErrorUsuario("El mes de origen no tiene montos");
    revisar(await supabase.from("presupuesto_montos").upsert(
      data.map((m) => ({ hogar_id: hogarId, concepto_id: m.concepto_id, anio, mes: destinoMes, monto: m.monto })),
    ));
    return `Copiados ${data.length} montos`;
  });
}

// ---------------------------------------------------------------------
// Préstamos bancarios
// ---------------------------------------------------------------------
export async function guardarPrestamo(fd: FormData) {
  await ejecutar(fd, async () => {
    const { supabase, hogarId } = await contexto();
    const fila = {
      hogar_id: hogarId,
      acreedor: req(fd, "acreedor", "el acreedor"),
      descripcion: txt(fd, "descripcion"),
      persona_id: opc(fd, "persona_id"),
      fecha_inicio: req(fd, "fecha_inicio", "la fecha de inicio"),
      fecha_primera_cuota: req(fd, "fecha_primera_cuota", "la fecha de la 1ª cuota"),
      monto_original: reqNum(fd, "monto_original", "El monto"),
      tasa_anual: pct(fd, "tasa_anual") ?? 0,
      base_dias: txt(fd, "base_dias") === "365" ? 365 : 360,
      cuotas_totales: reqNum(fd, "cuotas_totales", "Las cuotas totales"),
      cuota_total: reqNum(fd, "cuota_total", "La cuota"),
      seguro_cuota: numero(fd, "seguro_cuota") ?? 0,
      saldo_referencia: numero(fd, "saldo_referencia"),
      cuotas_pagadas_referencia: numero(fd, "cuotas_pagadas_referencia") ?? 0,
      fecha_referencia: opc(fd, "fecha_referencia"),
      activo: fd.get("activo") !== "off",
    };
    // Sólo se envía si se usa, para no romper bases sin la migración 0005.
    const penalidad = pct(fd, "penalidad_pago_anticipado");
    if (penalidad || fd.get("tenia_penalidad") === "1") {
      (fila as Record<string, unknown>).penalidad_pago_anticipado = penalidad ?? 0;
    }
    if (fila.saldo_referencia !== null && !fila.fecha_referencia) {
      throw new ErrorUsuario("Indica la fecha del saldo de referencia");
    }
    const id = opc(fd, "id");
    revisar(id ? await supabase.from("prestamos").update(fila).eq("id", id) : await supabase.from("prestamos").insert(fila));
    return "Préstamo guardado";
  });
}

export async function guardarAbono(fd: FormData) {
  await ejecutar(fd, async () => {
    const { supabase, hogarId } = await contexto();
    revisar(await supabase.from("prestamo_abonos").insert({
      hogar_id: hogarId,
      prestamo_id: req(fd, "prestamo_id", "el préstamo"),
      fecha: req(fd, "fecha", "la fecha"),
      monto: reqNum(fd, "monto", "El monto"),
      notas: opc(fd, "notas"),
    }));
    return "Abono registrado";
  });
}

// ---------------------------------------------------------------------
// Tarjetas
// ---------------------------------------------------------------------
export async function guardarTarjeta(fd: FormData) {
  await ejecutar(fd, async () => {
    const { supabase, hogarId } = await contexto();
    const fila = {
      hogar_id: hogarId,
      nombre: req(fd, "nombre", "el nombre"),
      persona_id: opc(fd, "persona_id"),
      moneda: txt(fd, "moneda") === "USD" ? "USD" : "DOP",
      limite: numero(fd, "limite") ?? 0,
      tasa_anual: pct(fd, "tasa_anual") ?? 0.6,
      dia_corte: numero(fd, "dia_corte"),
      dia_pago: numero(fd, "dia_pago"),
      pago_minimo: numero(fd, "pago_minimo"),
      pago_programado: numero(fd, "pago_programado"),
      saldo_referencia: numero(fd, "saldo_referencia") ?? 0,
      fecha_referencia: req(fd, "fecha_referencia", "la fecha del saldo"),
    };
    const id = opc(fd, "id");
    revisar(id ? await supabase.from("tarjetas").update(fila).eq("id", id) : await supabase.from("tarjetas").insert(fila));
    return "Tarjeta guardada";
  });
}

export async function guardarMovTarjeta(fd: FormData) {
  await ejecutar(fd, async () => {
    const { supabase, hogarId } = await contexto();
    const tipo = txt(fd, "tipo");
    revisar(await supabase.from("tarjeta_movimientos").insert({
      hogar_id: hogarId,
      tarjeta_id: req(fd, "tarjeta_id", "la tarjeta"),
      fecha: req(fd, "fecha", "la fecha"),
      tipo: ["consumo", "pago", "cargo"].includes(tipo) ? tipo : "consumo",
      monto: reqNum(fd, "monto", "El monto"),
      descripcion: opc(fd, "descripcion"),
    }));
    return "Movimiento registrado";
  });
}

// ---------------------------------------------------------------------
// Ahorros
// ---------------------------------------------------------------------
export async function guardarMovAhorro(fd: FormData) {
  await ejecutar(fd, async () => {
    const { supabase, hogarId } = await contexto();
    revisar(await supabase.from("ahorro_movimientos").insert({
      hogar_id: hogarId,
      fondo_id: req(fd, "fondo_id", "el fondo"),
      fecha: req(fd, "fecha", "la fecha"),
      persona_id: opc(fd, "persona_id"),
      tipo: txt(fd, "tipo") === "retiro" ? "retiro" : "aporte",
      monto: reqNum(fd, "monto", "El monto"),
      cuenta_id: opc(fd, "cuenta_id"),
      notas: opc(fd, "notas"),
    }));
    return "Movimiento de ahorro registrado";
  });
}

export async function actualizarMetaFondo(fd: FormData) {
  await ejecutar(fd, async () => {
    const { supabase } = await contexto();
    revisar(await supabase.from("fondos_ahorro").update({ meta: numero(fd, "meta") }).eq("id", req(fd, "id", "el fondo")));
    return "Meta actualizada";
  });
}

// ---------------------------------------------------------------------
// Préstamos personales
// ---------------------------------------------------------------------
export async function guardarPersonal(fd: FormData) {
  await ejecutar(fd, async () => {
    const { supabase, hogarId } = await contexto();
    const fila = {
      hogar_id: hogarId,
      contraparte: req(fd, "contraparte", "la persona"),
      direccion: txt(fd, "direccion") === "debo" ? "debo" : "me_deben",
      persona_id: opc(fd, "persona_id"),
      monto: reqNum(fd, "monto", "El monto"),
      fecha: req(fd, "fecha", "la fecha"),
      fecha_limite: opc(fd, "fecha_limite"),
      notas: opc(fd, "notas"),
    };
    const id = opc(fd, "id");
    revisar(id
      ? await supabase.from("prestamos_personales").update(fila).eq("id", id)
      : await supabase.from("prestamos_personales").insert(fila));
    return "Préstamo personal guardado";
  });
}

export async function guardarPagoPersonal(fd: FormData) {
  await ejecutar(fd, async () => {
    const { supabase, hogarId } = await contexto();
    revisar(await supabase.from("prestamo_personal_pagos").insert({
      hogar_id: hogarId,
      prestamo_personal_id: req(fd, "prestamo_personal_id", "el préstamo"),
      fecha: req(fd, "fecha", "la fecha"),
      monto: reqNum(fd, "monto", "El monto"),
      notas: opc(fd, "notas"),
    }));
    return "Pago registrado";
  });
}
