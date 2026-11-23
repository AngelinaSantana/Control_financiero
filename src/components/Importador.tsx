"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { analizarEstado, confirmarImportacion, type ResultadoAnalisis } from "@/app/(app)/importar/acciones";
import { formatoFecha } from "@/lib/fechas";
import { ACCIONES_POR_ORIGEN, ETIQUETAS_ACCION, type Accion, type FilaPropuesta } from "@/lib/importacion/propuestas";

type Op = { id: string; nombre: string };
interface Props {
  tarjetas: (Op & { moneda: "DOP" | "USD" })[];
  cuentas: Op[];
  categorias: (Op & { tipo: "gasto" | "ingreso" })[];
  prestamos: Op[];
  personas: Op[];
}

const fmt = (n: number, moneda: "DOP" | "USD" = "DOP") =>
  `${moneda === "USD" ? "US$" : "RD$"}${new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
const campo = "w-full rounded-md border border-borde bg-superficie px-2 py-1 text-sm";
const boton = "inline-flex items-center justify-center rounded-lg bg-marca px-4 py-2 text-sm font-semibold text-white hover:bg-marca-oscuro disabled:opacity-50";

export function Importador({ tarjetas, cuentas, categorias, prestamos, personas }: Props) {
  const [origen, setOrigen] = useState("");
  const [analisis, setAnalisis] = useState<ResultadoAnalisis | null>(null);
  const [filas, setFilas] = useState<FilaPropuesta[]>([]);
  const [actualizarSaldo, setActualizarSaldo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [leyendo, startLeer] = useTransition();
  const [importando, startImportar] = useTransition();

  const tipoOrigen = origen.startsWith("tarjeta:") ? "tarjeta" : "cuenta";
  const tarjetaOrigen = tarjetas.find((t) => `tarjeta:${t.id}` === origen);
  const saldoSugerido = analisis && tarjetaOrigen ? analisis.saldos.find((s) => s.moneda === tarjetaOrigen.moneda) : undefined;
  const puedeActualizarSaldo = !!(tarjetaOrigen && saldoSugerido?.saldo_al_corte != null && analisis?.fechaCorte);
  const aImportar = filas.filter((f) => f.accion !== "ignorar").length;

  const conteo = useMemo(() => {
    const c = new Map<Accion, number>();
    for (const f of filas) c.set(f.accion, (c.get(f.accion) ?? 0) + 1);
    return [...c.entries()];
  }, [filas]);

  function cambiar(id: number, cambios: Partial<FilaPropuesta>) {
    setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  }

  // onSubmit (y no action={...}) para que el formulario no se vacíe tras un error:
  // así, si faltaba la contraseña, no hay que volver a elegir el archivo.
  function leer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setHecho(null);
    startLeer(async () => {
      const r = await analizarEstado(fd);
      if (!r.ok) return setError(r.error);
      setAnalisis(r);
      setFilas(r.filas);
    });
  }

  function importar() {
    setError(null);
    startImportar(async () => {
      const r = await confirmarImportacion({
        origen,
        filas: filas.map(({ fecha, concepto, monto, moneda, accion, categoria_id, tarjeta_id, prestamo_id, persona_id, patron, duplicado }) =>
          ({ fecha, concepto, monto, moneda, accion, categoria_id, tarjeta_id, prestamo_id, persona_id, patron, duplicado })),
        actualizarSaldo: puedeActualizarSaldo && actualizarSaldo && tarjetaOrigen
          ? { tarjeta_id: tarjetaOrigen.id, saldo: saldoSugerido!.saldo_al_corte!, fecha: analisis!.fechaCorte!, pago_minimo: saldoSugerido!.pago_minimo }
          : null,
      });
      if (!r.ok) return setError(r.error);
      setHecho(r.resumen);
      setAnalisis(null);
      setFilas([]);
    });
  }

  return (
    <div className="space-y-4">
      {error && <div role="alert" className="rounded-xl border border-malo/30 bg-malo/10 px-4 py-3 text-sm text-malo">{error}</div>}
      {hecho && (
        <div role="status" className="rounded-xl border border-bueno/30 bg-bueno/10 px-4 py-3 text-sm text-bueno">
          {hecho} <Link href="/movimientos" className="font-semibold underline">Ver movimientos</Link> ·{" "}
          <Link href="/tarjetas" className="font-semibold underline">Ver tarjetas</Link>
        </div>
      )}

      {!analisis && (
        <form onSubmit={leer} className="grid gap-3 rounded-2xl border border-borde bg-superficie p-4 shadow-sm sm:p-5 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="font-medium text-tenue">¿De qué tarjeta o cuenta es el estado?</span>
            <select name="origen" required value={origen} onChange={(e) => setOrigen(e.target.value)} className={`${campo} py-2`}>
              <option value="" disabled>Elige…</option>
              <optgroup label="Tarjetas de crédito">
                {tarjetas.map((t) => <option key={t.id} value={`tarjeta:${t.id}`}>{t.nombre}{t.moneda === "USD" ? " (US$)" : ""}</option>)}
              </optgroup>
              <optgroup label="Cuentas bancarias">
                {cuentas.map((c) => <option key={c.id} value={`cuenta:${c.id}`}>{c.nombre}</option>)}
              </optgroup>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="font-medium text-tenue">Estado de cuenta (PDF, máx. 4 MB)</span>
            <input name="archivo" type="file" accept="application/pdf,.pdf" required className={`${campo} py-1.5`} />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="font-medium text-tenue">Contraseña del PDF (si tiene; muchos bancos usan tu cédula)</span>
            <input name="contrasena" type="password" autoComplete="off" className={`${campo} py-2`} />
          </label>
          <div className="flex items-end md:col-span-2">
            <button className={boton} disabled={leyendo}>{leyendo ? "Leyendo con Claude… (puede tardar hasta un minuto)" : "Leer estado de cuenta"}</button>
          </div>
          <p className="text-xs text-tenue md:col-span-4">
            La contraseña solo se usa para abrir el archivo en este momento; no se guarda. El contenido del estado se envía a Claude para extraer los movimientos.
          </p>
        </form>
      )}

      {analisis && (
        <section className="space-y-4 rounded-2xl border border-borde bg-superficie p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Revisa antes de importar</h2>
              <p className="text-sm text-tenue">
                {analisis.banco ?? "Estado de cuenta"} · {filas.length} movimientos
                {analisis.fechaCorte && ` · corte ${formatoFecha(analisis.fechaCorte)}`}
                {analisis.fechaLimite && ` · pagar antes de ${formatoFecha(analisis.fechaLimite)}`}
              </p>
              <p className="mt-1 text-xs text-tenue">{conteo.map(([a, n]) => `${ETIQUETAS_ACCION[a]}: ${n}`).join(" · ")}</p>
            </div>
            <button type="button" onClick={() => { setAnalisis(null); setFilas([]); }} className="text-sm text-tenue underline">Subir otro</button>
          </div>

          {analisis.avisos.map((a) => <p key={a} className="rounded-lg bg-aviso/15 px-3 py-2 text-sm text-aviso">{a}</p>)}

          {puedeActualizarSaldo && (
            <label className="flex items-start gap-2 rounded-lg bg-fondo p-3 text-sm">
              <input type="checkbox" checked={actualizarSaldo} onChange={(e) => setActualizarSaldo(e.target.checked)} className="mt-0.5 size-4 accent-marca" />
              <span>
                Actualizar el <strong>saldo conocido</strong> de {tarjetaOrigen!.nombre} a{" "}
                <strong>{fmt(saldoSugerido!.saldo_al_corte!, tarjetaOrigen!.moneda)}</strong> al {formatoFecha(analisis.fechaCorte)}
                {saldoSugerido!.pago_minimo != null && <> y el pago mínimo a {fmt(saldoSugerido!.pago_minimo, tarjetaOrigen!.moneda)}</>}.
                <span className="block text-xs text-tenue">Recomendado: así el saldo incluye intereses y cargos del banco exactamente como en el estado.</span>
              </span>
            </label>
          )}

          <div className="desplazable">
            <table className="tabla min-w-[1120px]">
              <thead>
                <tr><th>Fecha</th><th>Movimiento</th><th className="num">Monto</th><th>Acción</th><th>Categoría / destino</th><th>Responsable</th></tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const ignorada = f.accion === "ignorar";
                  const usaCategoria = f.accion === "gasto" || f.accion === "gasto_tarjeta" || f.accion === "ingreso";
                  const usaTarjeta = ["gasto_tarjeta", "pago_tarjeta", "cargo_tarjeta", "abono_tarjeta"].includes(f.accion);
                  const cats = categorias.filter((c) => c.tipo === (f.accion === "ingreso" ? "ingreso" : "gasto"));
                  return (
                    <tr key={f.id} className={ignorada ? "opacity-55" : ""}>
                      <td><input type="date" value={f.fecha} onChange={(e) => cambiar(f.id, { fecha: e.target.value })} className={`${campo} w-36`} aria-label="Fecha" /></td>
                      <td className="min-w-64">
                        <input value={f.concepto} onChange={(e) => cambiar(f.id, { concepto: e.target.value })} className={campo} aria-label="Concepto" />
                        <div className="mt-1 text-xs text-tenue">{f.descripcion}</div>
                        {f.duplicado && <div className="mt-1 text-xs font-medium text-aviso">⚠ {f.duplicado}</div>}
                        {f.origenSugerencia === "regla" && <div className="mt-1 text-xs text-marca">Según lo que elegiste antes para este comercio</div>}
                      </td>
                      <td className="num font-semibold">{fmt(f.monto, f.moneda)}</td>
                      <td>
                        <select value={f.accion} onChange={(e) => cambiar(f.id, { accion: e.target.value as Accion })} className={`${campo} w-48 pr-7`} aria-label="Acción">
                          {ACCIONES_POR_ORIGEN[tipoOrigen].map((a) => <option key={a} value={a}>{ETIQUETAS_ACCION[a]}</option>)}
                        </select>
                      </td>
                      <td className="min-w-52 space-y-1">
                        {usaCategoria && (
                          <select value={f.categoria_id ?? ""} onChange={(e) => cambiar(f.id, { categoria_id: e.target.value || null })} className={campo} aria-label="Categoría">
                            <option value="">Sin categoría</option>
                            {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                          </select>
                        )}
                        {usaTarjeta && (
                          <select value={f.tarjeta_id ?? ""} onChange={(e) => cambiar(f.id, { tarjeta_id: e.target.value || null })} className={campo} aria-label="Tarjeta">
                            <option value="">Elige la tarjeta…</option>
                            {tarjetas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                          </select>
                        )}
                        {f.accion === "cuota_prestamo" && (
                          <select value={f.prestamo_id ?? ""} onChange={(e) => cambiar(f.id, { prestamo_id: e.target.value || null })} className={campo} aria-label="Préstamo">
                            <option value="">Elige el préstamo…</option>
                            {prestamos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                          </select>
                        )}
                      </td>
                      <td>
                        <select value={f.persona_id ?? ""} onChange={(e) => cambiar(f.id, { persona_id: e.target.value || null })} className={`${campo} w-36 pr-7`} aria-label="Responsable">
                          <option value="">—</option>
                          {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={importar} disabled={importando || (aImportar === 0 && !(puedeActualizarSaldo && actualizarSaldo))} className={boton}>
              {importando ? "Importando…" : `Importar ${aImportar} movimiento(s)`}
            </button>
            <span className="text-xs text-tenue">
              Compra con tarjeta = gasto que sube la deuda · Pago a tarjeta = baja la deuda, no suma como gasto · Cargo = interés del banco
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
