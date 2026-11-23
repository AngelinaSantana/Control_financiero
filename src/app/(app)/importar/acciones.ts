"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { contexto, leerTodo, mensajeBase } from "@/lib/datos";
import { iso, partes, sumarMeses } from "@/lib/fechas";
import { ErrorExtraccion, extraerMovimientos } from "@/lib/importacion/claude";
import { ErrorPdf, leerPdf } from "@/lib/importacion/pdf";
import {
  construirPropuestas, montoEnRD, type Accion, type Existente, type FilaPropuesta, type ReglaImportacion,
} from "@/lib/importacion/propuestas";
import { num, type Gasto, type Ingreso, type MovTarjeta, type Prestamo, type Tarjeta } from "@/lib/tipos";

class ErrorRevision extends Error {}

const MAX_BYTES = 4 * 1024 * 1024; // Vercel limita el cuerpo de la solicitud a ~4.5 MB
const MAX_CARACTERES = 250_000;

export interface ResultadoAnalisis {
  ok: true;
  filas: FilaPropuesta[];
  banco: string | null;
  fechaCorte: string | null;
  fechaLimite: string | null;
  saldos: { moneda: "DOP" | "USD"; saldo_al_corte: number | null; pago_minimo: number | null }[];
  avisos: string[];
}
export type RespuestaAnalisis = ResultadoAnalisis | { ok: false; error: string };

const desplazarDias = (fecha: string, dias: number) => {
  const [a, m, d] = partes(fecha);
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return iso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
};

/** Paso 1: lee el PDF, lo envía a Claude y arma las propuestas para revisar. */
export async function analizarEstado(fd: FormData): Promise<RespuestaAnalisis> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { ok: false, error: "Falta configurar la clave de Claude (ANTHROPIC_API_KEY) en Vercel." };
    }
    const ctx = await contexto();
    const { supabase, categorias, hogar, miPersonaId } = ctx;

    const archivo = fd.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Elige el PDF del estado de cuenta." };
    if (archivo.size > MAX_BYTES) return { ok: false, error: "El PDF pesa más de 4 MB. Descarga solo el mes que necesitas." };
    const [tipoOrigen, idOrigen] = String(fd.get("origen") ?? "").split(":");
    if ((tipoOrigen !== "tarjeta" && tipoOrigen !== "cuenta") || !idOrigen) {
      return { ok: false, error: "Elige de qué tarjeta o cuenta es el estado." };
    }
    const contrasena = String(fd.get("contrasena") ?? "").trim() || undefined;

    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const pdf = await leerPdf(bytes.slice(), contrasena);
    const avisos: string[] = [];
    let entrada: { texto: string } | { pdfBase64: string };
    if (!pdf.esEscaneado) {
      const texto = pdf.texto.map((t, i) => `--- Página ${i + 1} ---\n${t}`).join("\n\n");
      if (texto.length > MAX_CARACTERES) return { ok: false, error: "El documento es demasiado largo. Prueba con menos páginas." };
      entrada = { texto };
    } else if (pdf.protegido) {
      return { ok: false, error: "Este PDF parece escaneado (imagen) y además tiene contraseña. Guárdalo sin contraseña y vuelve a subirlo." };
    } else {
      entrada = { pdfBase64: Buffer.from(bytes).toString("base64") };
      avisos.push("El PDF parece escaneado: se leyó como imagen. Revisa bien los montos.");
    }

    const nombresCategorias = categorias.map((c) => c.nombre);
    const estado = await extraerMovimientos(entrada, nombresCategorias);
    if (estado.movimientos.length === 0) return { ok: false, error: "No se encontraron movimientos en el documento." };
    if (tipoOrigen === "tarjeta" && estado.tipo_documento === "cuenta_bancaria") {
      avisos.push("Parece un estado de cuenta bancaria, pero elegiste una tarjeta. Revisa el origen.");
    }
    if (tipoOrigen === "cuenta" && estado.tipo_documento === "tarjeta_credito") {
      avisos.push("Parece un estado de tarjeta de crédito, pero elegiste una cuenta. Revisa el origen.");
    }

    // Movimientos ya registrados alrededor de esas fechas (para no duplicar)
    const fechas = estado.movimientos.map((m) => m.fecha).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort();
    const desde = desplazarDias(fechas[0] ?? sumarMeses(iso(new Date().getFullYear(), new Date().getMonth() + 1, 1), -2), -4);
    const hasta = desplazarDias(fechas.at(-1) ?? iso(new Date().getFullYear(), 12, 31), 4);
    const rango = (q: { gte: (c: string, v: string) => { lte: (c: string, v: string) => unknown } }) => q.gte("fecha", desde).lte("fecha", hasta);
    const tasa = num(hogar.tasa_cambio_usd);
    const [tarjetas, prestamos, gastos, ingresos, movs, reglas] = await Promise.all([
      leerTodo<Tarjeta>(supabase, "tarjetas", (q) => q.eq("activa", true), { columna: "nombre" }),
      leerTodo<Prestamo>(supabase, "prestamos", (q) => q.eq("activo", true), { columna: "acreedor" }),
      leerTodo<Gasto>(supabase, "gastos", rango, { columna: "fecha" }),
      leerTodo<Ingreso>(supabase, "ingresos", rango, { columna: "fecha" }),
      leerTodo<MovTarjeta>(supabase, "tarjeta_movimientos", rango, { columna: "fecha" }),
      leerTodo<ReglaImportacion>(supabase, "reglas_importacion").catch(() => [] as ReglaImportacion[]),
    ]);
    const monedaTarjeta = new Map(tarjetas.map((t) => [t.id, t.moneda]));
    const existentes: Existente[] = [
      ...gastos.map((g) => ({ fecha: g.fecha, montoRD: num(g.monto), concepto: g.concepto })),
      ...ingresos.map((i) => ({ fecha: i.fecha, montoRD: num(i.monto), concepto: i.concepto })),
      ...movs.map((m) => ({
        fecha: m.fecha,
        montoRD: montoEnRD(num(m.monto), monedaTarjeta.get(m.tarjeta_id) ?? "DOP", tasa),
        concepto: m.descripcion || `${m.tipo} de tarjeta`,
      })),
    ];

    const filas = construirPropuestas(estado, {
      origen: { tipo: tipoOrigen, id: idOrigen },
      categorias,
      tarjetas: tarjetas.map((t) => ({ id: t.id, nombre: t.nombre, moneda: t.moneda, persona_id: t.persona_id })),
      prestamos: prestamos.map((p) => ({ id: p.id, acreedor: p.acreedor, descripcion: p.descripcion })),
      reglas,
      existentes,
      tasaCambio: tasa,
      miPersonaId,
    });
    return {
      ok: true, filas, banco: estado.banco, fechaCorte: estado.fecha_corte, fechaLimite: estado.fecha_limite_pago,
      saldos: estado.saldos, avisos,
    };
  } catch (e) {
    if (e instanceof ErrorPdf || e instanceof ErrorExtraccion) return { ok: false, error: e.message };
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect de Next (sesión vencida)
    console.error("analizarEstado", e);
    return { ok: false, error: e instanceof Error ? mensajeBase(e.message) : "Error inesperado al leer el estado." };
  }
}

const ACCIONES = ["gasto", "gasto_tarjeta", "pago_tarjeta", "cargo_tarjeta", "abono_tarjeta", "ingreso", "cuota_prestamo", "ignorar"] as const;
const FilaConfirmada = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  concepto: z.string().min(1).max(200),
  monto: z.number().positive(),
  moneda: z.enum(["DOP", "USD"]),
  accion: z.enum(ACCIONES),
  categoria_id: z.string().nullable(),
  tarjeta_id: z.string().nullable(),
  prestamo_id: z.string().nullable(),
  persona_id: z.string().nullable(),
  patron: z.string(),
  duplicado: z.string().nullable(),
});
const Confirmacion = z.object({
  origen: z.string().regex(/^(tarjeta|cuenta):.+/),
  filas: z.array(FilaConfirmada).max(1000),
  actualizarSaldo: z.object({
    tarjeta_id: z.string(), saldo: z.number(), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), pago_minimo: z.number().nullable(),
  }).nullable(),
});

export type RespuestaConfirmacion = { ok: true; resumen: string } | { ok: false; error: string };

/** Paso 2: crea los gastos, ingresos y movimientos de tarjeta revisados. */
export async function confirmarImportacion(datos: z.input<typeof Confirmacion>): Promise<RespuestaConfirmacion> {
  try {
    const entrada = Confirmacion.parse(datos);
    const { supabase, hogarId, hogar, categorias } = await contexto();
    const tasa = num(hogar.tasa_cambio_usd);
    const [tipoOrigen, idOrigen] = entrada.origen.split(":");
    const cuentaId = tipoOrigen === "cuenta" ? idOrigen : null;
    const tarjetas = await leerTodo<Tarjeta>(supabase, "tarjetas");
    const monedaDe = new Map(tarjetas.map((t) => [t.id, t.moneda]));
    const catDeuda = (texto: string) => categorias.find((c) => c.tipo === "gasto" && c.nombre.toLowerCase().includes(texto))?.id ?? null;
    const catTarjetas = catDeuda("tarjeta");
    const catPrestamos = catDeuda("préstamo") ?? catDeuda("prestamo");

    const gastos: Record<string, unknown>[] = [];
    const ingresos: Record<string, unknown>[] = [];
    const movs: Record<string, unknown>[] = [];
    const reglas = new Map<string, Record<string, unknown>>();
    const necesitaTarjeta: Accion[] = ["gasto_tarjeta", "pago_tarjeta", "cargo_tarjeta", "abono_tarjeta"];

    for (const f of entrada.filas) {
      if (!f.duplicado && f.patron) {
        reglas.set(f.patron, {
          hogar_id: hogarId, patron: f.patron, accion: f.accion, categoria_id: f.categoria_id,
          tarjeta_id: f.accion === "pago_tarjeta" ? f.tarjeta_id : null,
          prestamo_id: f.accion === "cuota_prestamo" ? f.prestamo_id : null, updated_at: new Date().toISOString(),
        });
      }
      if (f.accion === "ignorar") continue;
      if (necesitaTarjeta.includes(f.accion) && !f.tarjeta_id) throw new ErrorRevision(`Elige la tarjeta para “${f.concepto}”.`);
      if (f.accion === "cuota_prestamo" && !f.prestamo_id) throw new ErrorRevision(`Elige el préstamo para “${f.concepto}”.`);

      const rd = montoEnRD(f.monto, f.moneda, tasa);
      const nota = `Importado de estado de cuenta${f.moneda === "USD" ? ` · US$${f.monto.toFixed(2)} a ${tasa}` : ""}`;
      const base = {
        hogar_id: hogarId, fecha: f.fecha, concepto: f.concepto, monto: rd, persona_id: f.persona_id,
        tipo: "Variable", quincena: partes(f.fecha)[2] <= 15 ? "Q1" : "Q2", cuenta_id: cuentaId, notas: nota,
      };
      switch (f.accion) {
        case "gasto":
          gastos.push({ ...base, categoria_id: f.categoria_id });
          break;
        case "gasto_tarjeta":
          gastos.push({ ...base, categoria_id: f.categoria_id, pagado_con_tarjeta_id: f.tarjeta_id });
          break;
        case "pago_tarjeta":
          gastos.push({ ...base, categoria_id: catTarjetas, tarjeta_id: f.tarjeta_id });
          break;
        case "cuota_prestamo":
          gastos.push({ ...base, categoria_id: catPrestamos, prestamo_id: f.prestamo_id, tipo: "Fijo" });
          break;
        case "ingreso":
          ingresos.push({ ...base, categoria_id: f.categoria_id });
          break;
        case "cargo_tarjeta":
        case "abono_tarjeta": {
          const moneda = monedaDe.get(f.tarjeta_id!) ?? "DOP";
          const monto = moneda === f.moneda ? f.monto : moneda === "USD" ? rd / (tasa || 1) : rd;
          movs.push({
            hogar_id: hogarId, tarjeta_id: f.tarjeta_id, fecha: f.fecha, tipo: f.accion === "cargo_tarjeta" ? "cargo" : "pago",
            monto: Math.round(monto * 100) / 100, descripcion: f.concepto,
          });
          break;
        }
      }
    }

    const revisar = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };
    if (gastos.length) revisar(await supabase.from("gastos").insert(gastos));
    if (ingresos.length) revisar(await supabase.from("ingresos").insert(ingresos));
    if (movs.length) revisar(await supabase.from("tarjeta_movimientos").insert(movs));
    if (entrada.actualizarSaldo) {
      const s = entrada.actualizarSaldo;
      const cambios: Record<string, unknown> = { saldo_referencia: s.saldo, fecha_referencia: s.fecha };
      if (s.pago_minimo !== null) cambios.pago_minimo = s.pago_minimo;
      revisar(await supabase.from("tarjetas").update(cambios).eq("id", s.tarjeta_id));
    }
    // Las reglas son una ayuda: si la tabla no existe todavía (migración 0004), no se interrumpe la importación.
    if (reglas.size) await supabase.from("reglas_importacion").upsert([...reglas.values()], { onConflict: "hogar_id,patron" });

    revalidatePath("/", "layout");
    const partesResumen = [
      gastos.length && `${gastos.length} gasto(s)`,
      ingresos.length && `${ingresos.length} ingreso(s)`,
      movs.length && `${movs.length} cargo(s)/abono(s) de tarjeta`,
      entrada.actualizarSaldo && "saldo de la tarjeta actualizado",
    ].filter(Boolean);
    return { ok: true, resumen: partesResumen.length ? `Importado: ${partesResumen.join(", ")}.` : "No había nada que importar." };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    if (e instanceof ErrorRevision) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Hay datos inválidos en la tabla (revisa fechas y montos)." };
    return { ok: false, error: e instanceof Error ? mensajeBase(e.message) : "Error inesperado al importar." };
  }
}
