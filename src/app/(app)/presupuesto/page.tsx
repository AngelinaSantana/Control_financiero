import Link from "next/link";
import { copiarMes, guardarConcepto } from "@/app/acciones";
import { AgregarAlPresupuesto } from "@/components/AgregarAlPresupuesto";
import { BotonEliminar } from "@/components/BotonEliminar";
import { CuadriculaPresupuesto, type FilaCuadricula } from "@/components/CuadriculaPresupuesto";
import {
  Barra, Campo, Encabezado, Insignia, Mensajes, Panel, Seleccion, SelectorMes, Vacio, claseBoton, claseBotonSec, claseInput, leerMes,
} from "@/components/ui";
import { cargarAnio } from "@/lib/cargas";
import { contexto, leerTodo, mapaNombres } from "@/lib/datos";
import { MESES, mesDe, rangoMes } from "@/lib/fechas";
import { dinero } from "@/lib/formato";
import { estadoCategoria, fijosSinPresupuesto, type EstadoCategoria } from "@/lib/presupuesto";
import {
  QUINCENAS, TIPOS_MOV, esPagoTarjeta, num, type ConceptoPresupuesto, type Gasto, type MontoPresupuesto,
} from "@/lib/tipos";

const ESTADOS: Record<EstadoCategoria, { texto: string; tono: "bueno" | "aviso" | "malo" | "normal"; barra: "bueno" | "aviso" | "malo" | "marca" }> = {
  bien: { texto: "Vas bien", tono: "bueno", barra: "bueno" },
  cerca: { texto: "Cerca del límite", tono: "aviso", barra: "aviso" },
  excedido: { texto: "Excedido", tono: "malo", barra: "malo" },
  sin_presupuesto: { texto: "Sin presupuesto", tono: "aviso", barra: "aviso" },
  sin_gasto: { texto: "Aún sin gastos", tono: "normal", barra: "marca" },
};

export default async function Presupuesto({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await contexto();
  const { supabase, categorias, personas, cuentas } = ctx;
  // ?mes=YYYY-MM (o el antiguo ?anio=YYYY)
  const hoy = new Date();
  const [anio, mes] = sp.mes ? leerMes(sp.mes) : sp.anio ? [Number(sp.anio), Number(sp.anio) === hoy.getFullYear() ? hoy.getMonth() + 1 : 1] : leerMes(undefined);
  const claveMes = `${anio}-${String(mes).padStart(2, "0")}`;
  const volver = `/presupuesto?mes=${claveMes}`;
  const [desdeFijos] = rangoMes(mes === 1 ? anio - 1 : anio, mes === 1 ? 12 : mes - 1);
  const [, hastaMes] = rangoMes(anio, mes);

  const [conceptos, montos, { gastos }, fijosRecientes] = await Promise.all([
    leerTodo<ConceptoPresupuesto>(supabase, "presupuesto_conceptos", undefined, { columna: "orden" }),
    leerTodo<MontoPresupuesto>(supabase, "presupuesto_montos", (q) => q.eq("anio", anio), { columna: "mes" }),
    cargarAnio(ctx, anio),
    leerTodo<Gasto>(supabase, "gastos", (q) => q.eq("tipo", "Fijo").gte("fecha", desdeFijos).lte("fecha", hastaMes), { columna: "fecha" }),
  ]);

  const editar = sp.editar ? conceptos.find((c) => c.id === sp.editar) : undefined;
  const nCat = mapaNombres(categorias);
  const ordenCat = new Map(categorias.map((c) => [c.id, c.orden]));
  const nPersona = mapaNombres(personas);
  const nCuenta = mapaNombres(cuentas);
  const montoDe = (conceptoId: string, m: number) => num(montos.find((x) => x.concepto_id === conceptoId && x.mes === m)?.monto);

  // ---------- Resumen del mes ----------
  // Para comparar con el plan, los pagos a tarjeta cuentan en su categoría de deuda
  // (el presupuesto planifica "Aporte a tarjeta"); si no tienen categoría, van a la de tarjetas.
  const catTarjetas = categorias.find((c) => c.tipo === "gasto" && /tarjeta/i.test(c.nombre))?.id ?? null;
  const categoriaReal = (g: Gasto) => (esPagoTarjeta(g) ? g.categoria_id ?? catTarjetas : g.categoria_id);
  const gastosMes = gastos.filter((g) => mesDe(g.fecha) === mes);
  const planeadoMes = conceptos.reduce((s, c) => s + montoDe(c.id, mes), 0);
  const gastadoMes = gastosMes.reduce((s, g) => s + num(g.monto), 0);
  const disponible = planeadoMes - gastadoMes;
  const porQuincena = { Q1: 0, Q2: 0, otro: 0 };
  let fijos = 0;
  for (const c of conceptos) {
    const m = montoDe(c.id, mes);
    if (c.tipo === "Fijo") fijos += m;
    if (c.quincena === "Q1") porQuincena.Q1 += m;
    else if (c.quincena === "Q2") porQuincena.Q2 += m;
    else if (c.quincena === "Ambas") { porQuincena.Q1 += m / 2; porQuincena.Q2 += m / 2; }
    else porQuincena.otro += m;
  }

  // ---------- Por categoría ----------
  const tarjetas = categorias
    .filter((c) => c.tipo === "gasto")
    .map((c) => {
      const items = conceptos.filter((x) => x.categoria_id === c.id);
      const planeado = items.reduce((s, x) => s + montoDe(x.id, mes), 0);
      const real = gastosMes.filter((g) => categoriaReal(g) === c.id).reduce((s, g) => s + num(g.monto), 0);
      return { id: c.id, nombre: c.nombre, orden: c.orden, items, planeado, real, estado: estadoCategoria(planeado, real) };
    })
    .filter((t) => t.planeado > 0 || t.real > 0)
    .sort((a, b) => b.planeado - a.planeado || b.real - a.real);
  const sinCategoria = gastosMes.filter((g) => !categoriaReal(g)).reduce((s, g) => s + num(g.monto), 0);
  const excedidas = tarjetas.filter((t) => t.estado === "excedido").length;

  // ---------- Fijos sin presupuesto (este mes y el anterior) ----------
  const pendientes = fijosSinPresupuesto(fijosRecientes, conceptos);

  // ---------- Cuadrícula anual ----------
  const filas: FilaCuadricula[] = [...conceptos]
    .sort((a, b) => (ordenCat.get(a.categoria_id) ?? 0) - (ordenCat.get(b.categoria_id) ?? 0) || a.orden - b.orden)
    .map((c) => ({
      id: c.id,
      concepto: c.concepto,
      categoria: nCat.get(c.categoria_id) ?? "—",
      detalle: [c.tipo, nPersona.get(c.persona_id ?? ""), c.quincena !== "N/A" ? c.quincena : null, nCuenta.get(c.cuenta_id ?? "")].filter(Boolean).join(" · "),
      montos: Array.from({ length: 12 }, (_, i) => montoDe(c.id, i + 1)),
    }));
  const realPorMes = Array.from({ length: 12 }, () => 0);
  for (const g of gastos) realPorMes[mesDe(g.fecha) - 1] += num(g.monto);
  const opcMeses = MESES.map((m, i) => ({ valor: String(i + 1), etiqueta: m }));
  const editarHref = (id: string) => `${volver}&editar=${id}#concepto`;

  return (
    <>
      <Encabezado titulo="Presupuesto" subtitulo="Tu plan de gastos del mes comparado con lo que realmente has gastado">
        <SelectorMes ruta="/presupuesto" anio={anio} mes={mes} />
      </Encabezado>
      <Mensajes error={sp.error} ok={sp.ok} />

      {/* ---------- Resumen ---------- */}
      <section className="mb-4 rounded-2xl border border-borde bg-superficie p-4 shadow-sm sm:p-5">
        {planeadoMes === 0 ? (
          <Vacio>
            No hay presupuesto para {MESES[mes - 1]} {anio}.{" "}
            {mes > 1 ? <>Puedes copiar el de {MESES[mes - 2]} más abajo o </> : null}
            <a href="#concepto" className="font-semibold text-marca">agregar un concepto</a>.
          </Vacio>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-tenue">{MESES[mes - 1]} {anio}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {dinero(gastadoMes)} <span className="text-base font-normal text-tenue">de {dinero(planeadoMes)} planeados</span>
                </div>
              </div>
              <div className={`text-right text-lg font-bold tabular-nums ${disponible >= 0 ? "text-bueno" : "text-malo"}`}>
                {disponible >= 0 ? `Quedan ${dinero(disponible)}` : `Te pasaste ${dinero(-disponible)}`}
              </div>
            </div>
            <div className="my-3"><Barra valor={planeadoMes ? gastadoMes / planeadoMes : 0} tono={disponible < 0 ? "malo" : gastadoMes / planeadoMes >= 0.85 ? "aviso" : "bueno"} /></div>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <MiniDato etiqueta="1ª quincena (día 15)" valor={dinero(porQuincena.Q1)} />
              <MiniDato etiqueta="2ª quincena (día 30)" valor={dinero(porQuincena.Q2)} />
              <MiniDato etiqueta="Gastos fijos" valor={dinero(fijos)} detalle={`${Math.round((fijos / planeadoMes) * 100)} % del plan`} />
              <MiniDato etiqueta="Categorías excedidas" valor={String(excedidas)} detalle={excedidas ? "revisa abajo" : "ninguna"} malo={excedidas > 0} />
            </div>
            {porQuincena.otro > 0 && <p className="mt-2 text-xs text-tenue">{dinero(porQuincena.otro)} del plan no tiene quincena asignada.</p>}
          </>
        )}
      </section>

      {/* ---------- Fijos sin presupuesto ---------- */}
      {pendientes.length > 0 && (
        <section className="mb-4 rounded-2xl border border-aviso/40 bg-aviso/5 p-4 sm:p-5">
          <h2 className="text-base font-semibold">Gastos fijos que no están en tu presupuesto</h2>
          <p className="mb-3 text-sm text-tenue">
            Los registraste como <strong>Fijo</strong> en {MESES[mes === 1 ? 11 : mes - 2]} o {MESES[mes - 1]}, pero no hay un concepto parecido en el presupuesto.
            Si se repiten, agrégalos; si no, cámbialos a <em>Variable</em> o <em>Pago único</em> en Movimientos y dejarán de aparecer aquí.
          </p>
          <ul className="divide-y divide-borde rounded-xl border border-borde bg-superficie">
            {pendientes.map((p) => (
              <li key={p.clave}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.concepto}</span>
                      <span className="block text-xs text-tenue">
                        {nCat.get(p.categoria_id ?? "") ?? "Sin categoría"}{p.veces > 1 ? ` · registrado ${p.veces} veces` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{dinero(p.monto)}</span>
                    <span className="shrink-0 rounded-lg border border-marca px-2.5 py-1 text-xs font-semibold text-marca group-open:bg-marca group-open:text-white">
                      <span className="group-open:hidden">Agregar</span><span className="hidden group-open:inline">Cerrar</span>
                    </span>
                  </summary>
                  <div className="border-t border-borde bg-fondo px-3 py-3">
                    <AgregarAlPresupuesto item={p} anio={anio} desdeMes={mes} categorias={categorias} volver={volver} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- Por categoría ---------- */}
      {tarjetas.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-base font-semibold">Por categoría</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tarjetas.map((t) => {
              const e = ESTADOS[t.estado];
              const resto = t.planeado - t.real;
              return (
                <article key={t.id} className="rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{t.nombre}</h3>
                    <Insignia tono={e.tono}>{e.texto}</Insignia>
                  </div>
                  <div className="mb-2 text-sm tabular-nums">
                    <strong>{dinero(t.real)}</strong> <span className="text-tenue">de {dinero(t.planeado)}</span>
                  </div>
                  <Barra valor={t.planeado ? t.real / t.planeado : t.real ? 1 : 0} tono={e.barra} />
                  <div className={`mt-1 text-xs ${resto < 0 ? "text-malo" : "text-tenue"}`}>
                    {t.planeado === 0 ? "Gastaste sin tener presupuesto aquí" : resto >= 0 ? `Quedan ${dinero(resto)}` : `Te pasaste ${dinero(-resto)}`}
                  </div>
                  {t.items.length > 0 && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-xs font-medium text-marca">Ver {t.items.length} concepto(s)</summary>
                      <ul className="mt-2 space-y-1">
                        {t.items.map((c) => (
                          <li key={c.id} className="flex justify-between gap-2">
                            <Link href={editarHref(c.id)} className="min-w-0 truncate hover:underline">
                              {c.concepto}
                              <span className="text-xs text-tenue"> · {[nPersona.get(c.persona_id ?? ""), c.quincena !== "N/A" ? c.quincena : null].filter(Boolean).join(" · ")}</span>
                            </Link>
                            <span className="shrink-0 tabular-nums">{montoDe(c.id, mes) ? dinero(montoDe(c.id, mes)) : "—"}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </article>
              );
            })}
            {sinCategoria > 0 && (
              <article className="rounded-2xl border border-dashed border-borde bg-superficie p-4">
                <h3 className="font-semibold">Sin categoría</h3>
                <p className="mt-1 text-sm">{dinero(sinCategoria)} en gastos sin categoría.</p>
                <Link href={`/movimientos?mes=${claveMes}&tipo=gastos`} className="text-xs font-medium text-marca hover:underline">Asignarles categoría</Link>
              </article>
            )}
          </div>
        </section>
      )}

      {/* ---------- Cuadrícula anual ---------- */}
      <Panel
        titulo={`Montos por mes · ${anio}`}
        className="mb-4"
        accion={<span className="hidden text-xs text-tenue sm:inline">Escribe en una celda y se guarda solo · toca un concepto para editarlo</span>}
      >
        {filas.length === 0 ? <Vacio>Aún no hay conceptos. Agrega el primero abajo.</Vacio> : (
          <CuadriculaPresupuesto
            key={`${anio}-${conceptos.length}-${montos.length}`}
            anio={anio}
            filas={filas}
            real={realPorMes}
            mesResaltado={mes}
            editarBase={volver}
          />
        )}
      </Panel>

      {/* ---------- Agregar / editar / copiar ---------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section id="concepto" className="scroll-mt-28 rounded-2xl border border-borde bg-superficie p-4 shadow-sm sm:p-5 lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold">{editar ? `Editar “${editar.concepto}”` : "Agregar concepto"}</h2>
          <form action={guardarConcepto} className="grid grid-cols-2 gap-3 md:grid-cols-4" key={editar?.id ?? "nuevo"}>
            <input type="hidden" name="volver" value={volver} />
            <input type="hidden" name="anio" value={anio} />
            {editar && <input type="hidden" name="id" value={editar.id} />}
            <Campo etiqueta="Concepto" className="col-span-2">
              <input name="concepto" required defaultValue={editar?.concepto} placeholder="Casa (alquiler)" className={claseInput} />
            </Campo>
            <Campo etiqueta="Categoría">
              <Seleccion name="categoria_id" required valor={editar?.categoria_id} opciones={categorias.filter((c) => c.tipo === "gasto").map((c) => ({ valor: c.id, etiqueta: c.nombre }))} />
            </Campo>
            <Campo etiqueta="Tipo">
              <Seleccion name="tipo" valor={editar?.tipo ?? "Fijo"} opciones={TIPOS_MOV.map((t) => ({ valor: t, etiqueta: t }))} />
            </Campo>
            <Campo etiqueta="Responsable">
              <Seleccion name="persona_id" vacio="—" valor={editar?.persona_id} opciones={personas.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} />
            </Campo>
            <Campo etiqueta="Quincena">
              <Seleccion name="quincena" valor={editar?.quincena ?? "N/A"} opciones={QUINCENAS.map((q) => ({ valor: q.valor, etiqueta: q.etiqueta }))} />
            </Campo>
            <Campo etiqueta="Cuenta">
              <Seleccion name="cuenta_id" vacio="—" valor={editar?.cuenta_id} opciones={cuentas.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} />
            </Campo>
            {!editar && (
              <>
                <Campo etiqueta="Monto al mes">
                  <input name="monto" inputMode="decimal" placeholder="0.00" className={claseInput} />
                </Campo>
                <Campo etiqueta="Desde el mes">
                  <Seleccion name="desde_mes" valor={String(mes)} opciones={opcMeses} />
                </Campo>
              </>
            )}
            <div className="col-span-2 flex flex-wrap items-end gap-3 md:col-span-4">
              <button className={claseBoton}>{editar ? "Guardar cambios" : "Agregar"}</button>
              {editar && <Link href={volver} className={claseBotonSec}>Cancelar</Link>}
            </div>
            {!editar && <p className="col-span-2 text-xs text-tenue md:col-span-4">El monto se copia en cada mes desde el elegido hasta diciembre; luego puedes ajustarlo en la tabla.</p>}
            {editar && <p className="col-span-2 text-xs text-tenue md:col-span-4">Los montos de cada mes se cambian directamente en la tabla de arriba.</p>}
          </form>
          {/* Fuera del formulario de editar: un formulario no puede ir dentro de otro (el botón no funcionaría). */}
          {editar && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-3">
              <span className="text-xs text-tenue">Eliminar borra el concepto y sus montos de todos los meses. Tus gastos registrados no cambian.</span>
              <BotonEliminar tabla="presupuesto_conceptos" id={editar.id} volver={volver} texto="Eliminar concepto" />
            </div>
          )}
        </section>

        <Panel titulo="Copiar un mes a otro">
          <form action={copiarMes} className="flex flex-col gap-3">
            <input type="hidden" name="volver" value={volver} />
            <input type="hidden" name="anio" value={anio} />
            <Campo etiqueta="Copiar desde">
              <Seleccion name="origen" valor={String(Math.max(mes - 1, 1))} opciones={opcMeses} />
            </Campo>
            <Campo etiqueta="Hacia">
              <Seleccion name="destino" valor={String(mes)} opciones={opcMeses} />
            </Campo>
            <button className={claseBotonSec}>Copiar montos</button>
            <p className="text-xs text-tenue">Reemplaza los montos del mes destino con los del mes de origen, concepto por concepto.</p>
          </form>
        </Panel>
      </div>
      <p className="mt-4 text-xs text-tenue">
        El gasto real sale de Movimientos. Aquí los pagos a tarjeta se comparan con lo que planeaste abonar a tus tarjetas
        (categoría de deuda de tarjetas); en Inicio y Reportes no suman como gasto porque son transferencias.
      </p>
    </>
  );
}

function MiniDato({ etiqueta, valor, detalle, malo }: { etiqueta: string; valor: string; detalle?: string; malo?: boolean }) {
  return (
    <div className="rounded-xl bg-fondo p-3">
      <div className="text-xs text-tenue">{etiqueta}</div>
      <div className={`font-semibold tabular-nums ${malo ? "text-malo" : ""}`}>{valor}</div>
      {detalle && <div className="text-xs text-tenue">{detalle}</div>}
    </div>
  );
}
