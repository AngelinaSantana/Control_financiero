import Link from "next/link";
import { copiarMes, guardarConcepto } from "@/app/acciones";
import { BotonEliminar } from "@/components/BotonEliminar";
import { CuadriculaPresupuesto, type FilaCuadricula } from "@/components/CuadriculaPresupuesto";
import { Campo, Encabezado, Mensajes, Panel, Seleccion, Vacio, claseBoton, claseBotonSec, claseInput } from "@/components/ui";
import { cargarAnio } from "@/lib/cargas";
import { contexto, leerTodo, mapaNombres } from "@/lib/datos";
import { MESES, mesDe } from "@/lib/fechas";
import { QUINCENAS, TIPOS_MOV, esPagoTarjeta, num, type ConceptoPresupuesto, type MontoPresupuesto } from "@/lib/tipos";

export default async function Presupuesto({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await contexto();
  const { supabase, categorias, personas, cuentas, hogar } = ctx;
  const anio = Number(sp.anio) || hogar.anio_trabajo || new Date().getFullYear();
  const volver = `/presupuesto?anio=${anio}`;

  const [conceptos, montos, { gastos }] = await Promise.all([
    leerTodo<ConceptoPresupuesto>(supabase, "presupuesto_conceptos", undefined, { columna: "orden" }),
    leerTodo<MontoPresupuesto>(supabase, "presupuesto_montos", (q) => q.eq("anio", anio), { columna: "mes" }),
    cargarAnio(ctx, anio),
  ]);

  const editar = sp.editar ? conceptos.find((c) => c.id === sp.editar) : undefined;
  const nCat = mapaNombres(categorias);
  const ordenCat = new Map(categorias.map((c) => [c.id, c.orden]));
  const nPersona = mapaNombres(personas);
  const nCuenta = mapaNombres(cuentas);

  const filas: FilaCuadricula[] = [...conceptos]
    .sort((a, b) => (ordenCat.get(a.categoria_id) ?? 0) - (ordenCat.get(b.categoria_id) ?? 0) || a.orden - b.orden)
    .map((c) => {
      const m = Array.from({ length: 12 }, () => 0);
      for (const x of montos) if (x.concepto_id === c.id) m[x.mes - 1] = num(x.monto);
      return {
        id: c.id,
        concepto: c.concepto,
        categoria: nCat.get(c.categoria_id) ?? "—",
        detalle: [c.tipo, nPersona.get(c.persona_id ?? ""), c.quincena !== "N/A" ? c.quincena : null, nCuenta.get(c.cuenta_id ?? "")]
          .filter(Boolean).join(" · "),
        montos: m,
      };
    });

  const real = Array.from({ length: 12 }, () => 0);
  for (const g of gastos) if (!esPagoTarjeta(g)) real[mesDe(g.fecha) - 1] += num(g.monto);
  const mesActual = new Date().getMonth() + 1;
  const opcMeses = MESES.map((m, i) => ({ valor: String(i + 1), etiqueta: m }));

  return (
    <>
      <Encabezado titulo={`Presupuesto ${anio}`} subtitulo="Monto planeado por concepto y mes. Escribe en la celda y se guarda solo.">
        <Link href={`/presupuesto?anio=${anio - 1}`} className={claseBotonSec}>‹ {anio - 1}</Link>
        <Link href={`/presupuesto?anio=${anio + 1}`} className={claseBotonSec}>{anio + 1} ›</Link>
      </Encabezado>
      <Mensajes error={sp.error} ok={sp.ok} />

      <Panel className="mb-4">
        {filas.length === 0 ? <Vacio>Aún no hay conceptos. Agrega el primero abajo.</Vacio> : (
          <CuadriculaPresupuesto key={`${anio}-${conceptos.length}-${montos.length}`} anio={anio} filas={filas} real={real} />
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel titulo={editar ? "Editar concepto" : "Agregar concepto"} className="lg:col-span-2">
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
                <Campo etiqueta="Monto mensual">
                  <input name="monto" inputMode="decimal" placeholder="0.00" className={claseInput} />
                </Campo>
                <Campo etiqueta="Desde el mes">
                  <Seleccion name="desde_mes" valor={String(mesActual)} opciones={opcMeses} />
                </Campo>
              </>
            )}
            <div className="col-span-2 flex items-end gap-2 md:col-span-4">
              <button className={claseBoton}>{editar ? "Guardar" : "Agregar"}</button>
              {editar && (
                <>
                  <Link href={volver} className={claseBotonSec}>Cancelar</Link>
                  <BotonEliminar tabla="presupuesto_conceptos" id={editar.id} volver={volver} texto="Eliminar concepto" />
                </>
              )}
            </div>
          </form>
          {!editar && conceptos.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-tenue">Editar o eliminar un concepto existente</summary>
              <ul className="mt-2 flex flex-wrap gap-2">
                {conceptos.map((c) => (
                  <li key={c.id}>
                    <Link href={`${volver}&editar=${c.id}`} className="rounded-full border border-borde px-3 py-1 hover:bg-fondo">{c.concepto}</Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Panel>

        <Panel titulo="Copiar un mes a otro">
          <form action={copiarMes} className="flex flex-col gap-3">
            <input type="hidden" name="volver" value={volver} />
            <input type="hidden" name="anio" value={anio} />
            <Campo etiqueta="Copiar desde">
              <Seleccion name="origen" valor={String(Math.max(mesActual - 1, 1))} opciones={opcMeses} />
            </Campo>
            <Campo etiqueta="Hacia">
              <Seleccion name="destino" valor={String(mesActual)} opciones={opcMeses} />
            </Campo>
            <button className={claseBotonSec}>Copiar montos</button>
            <p className="text-xs text-tenue">Sobrescribe los montos del mes destino para los mismos conceptos.</p>
          </form>
        </Panel>
      </div>
    </>
  );
}
