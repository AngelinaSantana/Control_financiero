import Link from "next/link";
import { BotonEliminar } from "@/components/BotonEliminar";
import { FormMovimiento } from "@/components/FormMovimiento";
import { AgregarAlPresupuesto } from "@/components/AgregarAlPresupuesto";
import { PasarFijos } from "@/components/PasarFijos";
import { Encabezado, Mensajes, Panel, Seleccion, SelectorMes, Vacio, claseBotonSec, claseInput, leerMes } from "@/components/ui";
import { contexto, leerTodo, mapaNombres } from "@/lib/datos";
import { MESES, anioDe, formatoFecha, mesDe, rangoMes } from "@/lib/fechas";
import { conceptoCoincidente, esFijoPresupuestable } from "@/lib/presupuesto";
import { dinero } from "@/lib/formato";
import { esPagoTarjeta, num, type Gasto, type Ingreso, type Prestamo, type Tarjeta } from "@/lib/tipos";

type SP = Record<string, string | undefined>;

export default async function Movimientos({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await contexto();
  const { supabase, personas, cuentas, categorias, miPersonaId } = ctx;
  const [anio, mes] = leerMes(sp.mes);
  const tabla = sp.tipo === "ingresos" || sp.nuevo === "ingreso" ? "ingresos" : "gastos";
  const [desde, hasta] = rangoMes(anio, mes);
  const claveMes = `${anio}-${String(mes).padStart(2, "0")}`;

  const [anioSig, mesSig] = mes === 12 ? [anio + 1, 1] : [anio, mes + 1];
  const [desdeSig, hastaSig] = rangoMes(anioSig, mesSig);
  const claveSig = `${anioSig}-${String(mesSig).padStart(2, "0")}`;

  const [filas, prestamos, tarjetas, fijosMes, fijosSig] = await Promise.all([
    leerTodo<Gasto | Ingreso>(supabase, tabla, (q) => {
      let r = q.gte("fecha", desde).lte("fecha", hasta);
      if (sp.persona) r = r.eq("persona_id", sp.persona);
      if (sp.categoria) r = r.eq("categoria_id", sp.categoria);
      if (sp.q) r = r.ilike("concepto", `%${sp.q.replace(/[%_,()]/g, "")}%`);
      return r;
    }, { columna: "fecha", asc: false }),
    leerTodo<Prestamo>(supabase, "prestamos", (q) => q.eq("activo", true), { columna: "acreedor" }),
    leerTodo<Tarjeta>(supabase, "tarjetas", (q) => q.eq("activa", true), { columna: "nombre" }),
    leerTodo<Gasto | Ingreso>(supabase, tabla, (q) => q.eq("tipo", "Fijo").gte("fecha", desde).lte("fecha", hasta), { columna: "fecha" }),
    leerTodo<Gasto | Ingreso>(supabase, tabla, (q) => q.eq("tipo", "Fijo").gte("fecha", desdeSig).lte("fecha", hastaSig), { columna: "fecha" }),
  ]);

  // Sugerencia tras guardar un gasto Fijo que no está en el presupuesto
  let sugerido: Gasto | null = null;
  if (sp.sugerir && tabla === "gastos") {
    const [{ data: g }, { data: conceptos }] = await Promise.all([
      supabase.from("gastos").select("*").eq("id", sp.sugerir).maybeSingle(),
      supabase.from("presupuesto_conceptos").select("concepto"),
    ]);
    if (g && esFijoPresupuestable(g as Gasto) && !conceptoCoincidente((g as Gasto).concepto, conceptos ?? [])) sugerido = g as Gasto;
  }

  const editar = sp.editar
    ? ((await supabase.from(tabla).select("*").eq("id", sp.editar).maybeSingle()).data as Gasto | Ingreso | null)
    : null;

  const nPersona = mapaNombres(personas);
  const nCuenta = mapaNombres(cuentas);
  const nCat = mapaNombres(categorias);
  const nPrestamo = new Map(prestamos.map((p) => [p.id, `${p.acreedor} – ${p.descripcion}`]));
  const nTarjeta = mapaNombres(tarjetas);
  const transferencias = tabla === "gastos" ? filas.filter((f) => esPagoTarjeta(f as Gasto)) : [];
  const total = filas.reduce((s, f) => s + num(f.monto), 0) - transferencias.reduce((s, f) => s + num(f.monto), 0);
  const totalTransf = transferencias.reduce((s, f) => s + num(f.monto), 0);

  const base = `/movimientos?mes=${claveMes}&tipo=${tabla}`;
  const filtros = new URLSearchParams();
  for (const k of ["persona", "categoria", "q"]) if (sp[k]) filtros.set(k, sp[k]!);
  const volver = `${base}${filtros.size ? "&" + filtros : ""}`;
  const formAbierto = !!(sp.nuevo || editar);

  return (
    <>
      <Encabezado titulo="Movimientos" subtitulo="Registra cada ingreso y gasto real">
        <SelectorMes ruta="/movimientos" anio={anio} mes={mes} extra={`&tipo=${tabla}`} />
      </Encabezado>
      <Mensajes error={sp.error} ok={sp.ok} />
      {sugerido && (
        <section className="mb-4 rounded-2xl border border-marca/30 bg-marca/5 p-4">
          <p className="mb-1 text-sm font-semibold">“{sugerido.concepto}” es un gasto fijo que no está en tu presupuesto.</p>
          <p className="mb-3 text-sm text-tenue">
            Si se repite cada mes, agrégalo para que el presupuesto refleje lo que realmente necesitas y no aparezca como excedido.
          </p>
          <AgregarAlPresupuesto
            item={{ ...sugerido, monto: num(sugerido.monto) }}
            anio={anioDe(sugerido.fecha)}
            desdeMes={mesDe(sugerido.fecha)}
            categorias={categorias}
            volver={volver}
            cancelar={volver}
          />
        </section>
      )}

      <div className="mb-4 inline-flex rounded-lg border border-borde bg-superficie p-1">
        {(["gastos", "ingresos"] as const).map((t) => (
          <Link
            key={t}
            href={`/movimientos?mes=${claveMes}&tipo=${t}`}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold ${tabla === t ? "bg-marca text-white" : "text-tenue"}`}
          >
            {t === "gastos" ? "Gastos" : "Ingresos"}
          </Link>
        ))}
      </div>

      <details open={formAbierto} className="mb-4 rounded-2xl border border-borde bg-superficie p-4 shadow-sm sm:p-5">
        <summary className="cursor-pointer text-base font-semibold">
          {editar ? "Editar movimiento" : tabla === "gastos" ? "+ Nuevo gasto" : "+ Nuevo ingreso"}
        </summary>
        <div className="mt-4">
          <FormMovimiento
            key={editar?.id ?? "nuevo"}
            tabla={tabla}
            volver={volver}
            personas={personas}
            cuentas={cuentas}
            categorias={categorias}
            prestamos={prestamos.map((p) => ({ id: p.id, nombre: `${p.acreedor} – ${p.descripcion}` }))}
            tarjetas={tarjetas}
            editar={editar}
            miPersonaId={miPersonaId}
          />
          {editar && <Link href={volver} className={`${claseBotonSec} mt-3`}>Cancelar edición</Link>}
        </div>
      </details>

      {fijosMes.length > 0 && (
        <PasarFijos
          tabla={tabla}
          fijos={fijosMes}
          existentes={fijosSig}
          nombreMesSig={`${MESES[mesSig - 1]} ${anioSig}`}
          volver={`/movimientos?mes=${claveSig}&tipo=${tabla}`}
          nombrePersona={(id) => nPersona.get(id ?? "") ?? "—"}
        />
      )}

      <Panel>
        <form className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5" action="/movimientos">
          <input type="hidden" name="mes" value={claveMes} />
          <input type="hidden" name="tipo" value={tabla} />
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar concepto" className={`${claseInput} col-span-2`} />
          <Seleccion name="persona" vacio="Todos" valor={sp.persona} opciones={personas.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} />
          <Seleccion
            name="categoria"
            vacio="Todas las categorías"
            valor={sp.categoria}
            opciones={categorias.filter((c) => c.tipo === (tabla === "gastos" ? "gasto" : "ingreso")).map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
          />
          <button className={claseBotonSec}>Filtrar</button>
        </form>

        <div className="mb-2 flex justify-between text-sm">
          <span className="text-tenue">{filas.length} movimientos</span>
          <span className="text-right">
            <span className="font-semibold tabular-nums">Total {dinero(total)}</span>
            {totalTransf > 0 && <span className="block text-xs text-tenue">+ {dinero(totalTransf)} en pagos a tarjetas (no suman)</span>}
          </span>
        </div>

        {filas.length === 0 ? <Vacio>No hay {tabla} en este mes.</Vacio> : (
          <div className="desplazable">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Responsable</th><th>Cuenta</th><th>Tipo</th><th>Q</th>
                  <th className="num">Monto</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const g = f as Gasto;
                  const enlace = g.prestamo_id
                    ? `Cuota de ${nPrestamo.get(g.prestamo_id)}`
                    : g.tarjeta_id
                      ? `Pago a ${nTarjeta.get(g.tarjeta_id)} (transferencia, no suma como gasto)`
                      : g.pagado_con_tarjeta_id
                        ? `Pagado con ${nTarjeta.get(g.pagado_con_tarjeta_id)}`
                        : null;
                  return (
                    <tr key={f.id}>
                      <td className="whitespace-nowrap">{formatoFecha(f.fecha)}</td>
                      <td>
                        <div className="font-medium">{f.concepto}</div>
                        {enlace && <div className="text-xs text-marca">↳ {enlace}</div>}
                        {f.notas && <div className="text-xs text-tenue">{f.notas}</div>}
                      </td>
                      <td>{nCat.get(f.categoria_id ?? "") ?? "—"}</td>
                      <td>{nPersona.get(f.persona_id ?? "") ?? "—"}</td>
                      <td>{nCuenta.get(f.cuenta_id ?? "") ?? "—"}</td>
                      <td>{f.tipo}</td>
                      <td>{f.quincena}</td>
                      <td className={`num font-semibold ${esPagoTarjeta(g) ? "text-tenue" : ""}`}>{dinero(num(f.monto))}</td>
                      <td className="whitespace-nowrap">
                        <Link href={`${volver}&editar=${f.id}`} className="mr-3 text-xs font-medium text-marca hover:underline">Editar</Link>
                        <BotonEliminar tabla={tabla} id={f.id} volver={volver} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
