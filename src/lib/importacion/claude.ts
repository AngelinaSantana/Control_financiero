import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

/** Lo que Claude devuelve de un estado de cuenta. */
export const EsquemaEstado = z.object({
  banco: z.string().nullable(),
  tipo_documento: z.enum(["tarjeta_credito", "cuenta_bancaria", "otro"]),
  fecha_corte: z.string().nullable().describe("YYYY-MM-DD"),
  fecha_limite_pago: z.string().nullable().describe("YYYY-MM-DD"),
  saldos: z.array(z.object({
    moneda: z.enum(["DOP", "USD"]),
    saldo_al_corte: z.number().nullable(),
    pago_minimo: z.number().nullable(),
  })),
  movimientos: z.array(z.object({
    fecha: z.string().describe("YYYY-MM-DD"),
    descripcion: z.string(),
    monto: z.number().describe("Siempre positivo"),
    moneda: z.enum(["DOP", "USD"]),
    sentido: z.enum(["debito", "credito"]),
    tipo: z.enum([
      "compra", "pago_tarjeta", "interes_comision", "ingreso", "transferencia",
      "retiro_efectivo", "cuota_prestamo", "devolucion", "otro",
    ]),
    categoria: z.string().nullable(),
  })),
});
export type EstadoExtraido = z.infer<typeof EsquemaEstado>;

export class ErrorExtraccion extends Error {}

const SISTEMA = `Extraes movimientos de estados de cuenta de bancos de República Dominicana para una app de finanzas del hogar.

Reglas:
- Incluye TODAS las transacciones del período, una por fila, en el orden del documento. No incluyas filas de resumen (saldo anterior, totales, límite, disponible) ni publicidad.
- Fechas: los bancos dominicanos escriben día/mes. Convierte a YYYY-MM-DD; si la fila no trae año, dedúcelo del período o de la fecha de corte (cuidado con diciembre/enero).
- monto siempre positivo. sentido = "debito" si aumenta la deuda de la tarjeta o saca dinero de la cuenta; "credito" si la reduce o entra dinero.
- moneda: "USD" si la transacción está en dólares (sección o columna en US$), si no "DOP".
- tipo: compra (consumo en comercio o en línea), pago_tarjeta (pago o abono a una tarjeta, p. ej. "SU PAGO GRACIAS"), interes_comision (intereses, cargos, comisiones, sobregiro, seguros, impuestos del banco), ingreso (nómina, depósito, transferencia recibida de terceros), transferencia (entre cuentas propias), retiro_efectivo, cuota_prestamo, devolucion (reverso o devolución de una compra), otro.
- categoria: elige exactamente una de la lista que se te da, o null si ninguna aplica o es un pago/transferencia.
- saldos: saldo al corte y pago mínimo por moneda, si el documento los muestra.
- Copia la descripción tal como aparece (sin números de tarjeta completos).`;

/**
 * Pide a Claude extraer los movimientos del texto (o del PDF escaneado).
 * Usa claude-opus-5-5 con salida estructurada validada por el esquema, y
 * respaldo automático del servidor si el modelo declina la solicitud.
 */
export async function extraerMovimientos(entrada: { texto: string } | { pdfBase64: string }, categorias: string[]): Promise<EstadoExtraido> {
  const cliente = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno
  const documento: Anthropic.Beta.BetaContentBlockParam =
    "texto" in entrada
      ? { type: "text", text: `<estado_de_cuenta>\n${entrada.texto}\n</estado_de_cuenta>` }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: entrada.pdfBase64 } };

  let respuesta;
  try {
    respuesta = await cliente.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 20000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(EsquemaEstado) },
      system: SISTEMA,
      messages: [{
        role: "user",
        content: [documento, { type: "text", text: `Categorías disponibles: ${categorias.join(", ")}.\nExtrae los movimientos de este estado de cuenta.` }],
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ErrorExtraccion("La clave de API de Claude no es válida. Revisa ANTHROPIC_API_KEY en Vercel.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new ErrorExtraccion("La cuenta de Claude no tiene permiso o no tiene saldo. Revisa platform.claude.com → Billing.");
    if (e instanceof Anthropic.RateLimitError) throw new ErrorExtraccion("Claude está recibiendo muchas solicitudes. Espera un minuto y vuelve a intentar.");
    if (e instanceof Anthropic.BadRequestError && /credit|balance/i.test(e.message)) {
      throw new ErrorExtraccion("La cuenta de Claude no tiene saldo. Recarga en platform.claude.com → Billing.");
    }
    if (e instanceof Anthropic.APIError) throw new ErrorExtraccion(`Error de Claude (${e.status ?? "red"}): ${e.message}`);
    throw e;
  }

  if (respuesta.stop_reason === "refusal") throw new ErrorExtraccion("Claude no pudo procesar este documento.");
  if (respuesta.stop_reason === "max_tokens") {
    throw new ErrorExtraccion("El estado de cuenta es demasiado largo para procesarlo de una vez. Prueba con menos páginas.");
  }
  const datos = respuesta.parsed_output;
  if (!datos) throw new ErrorExtraccion("No se pudo interpretar la respuesta de Claude. Intenta de nuevo.");
  return datos;
}
