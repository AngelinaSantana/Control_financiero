import { actualizarHogar, agregarCatalogo } from "@/app/acciones";
import { BotonEliminar } from "@/components/BotonEliminar";
import { Campo, Encabezado, Mensajes, Panel, claseBoton, claseBotonSec, claseInput } from "@/components/ui";
import { contexto } from "@/lib/datos";
import { num } from "@/lib/tipos";

export default async function Configuracion({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { hogar, personas, cuentas, categorias, supabase } = await contexto();
  const { data: miembros } = await supabase.from("miembros").select("persona_id, created_at");
  const conCuenta = new Set((miembros ?? []).map((m) => m.persona_id));
  const volver = "/configuracion";

  const Lista = ({ titulo, tabla, items, tipo, detalle }: {
    titulo: string; tabla: string; items: { id: string; nombre: string }[]; tipo?: string; detalle?: (id: string) => string | null;
  }) => (
    <Panel titulo={titulo}>
      <ul className="mb-3 divide-y divide-borde text-sm">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 py-1.5">
            <span>{i.nombre} {detalle?.(i.id) && <span className="text-xs text-tenue">· {detalle(i.id)}</span>}</span>
            <BotonEliminar tabla={tabla} id={i.id} volver={volver} texto="Quitar" />
          </li>
        ))}
      </ul>
      <form action={agregarCatalogo} className="flex gap-2">
        <input type="hidden" name="volver" value={volver} />
        <input type="hidden" name="tabla" value={tabla} />
        {tipo && <input type="hidden" name="tipo" value={tipo} />}
        <input name="nombre" required placeholder="Nuevo…" className={claseInput} aria-label={`Agregar a ${titulo}`} />
        <button className={claseBotonSec}>Agregar</button>
      </form>
    </Panel>
  );

  return (
    <>
      <Encabezado titulo="Configuración" subtitulo="Parámetros del hogar y listas desplegables" />
      <Mensajes error={sp.error} ok={sp.ok} />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Panel titulo="Invitar a tu pareja">
          <p className="mb-3 text-sm text-tenue">Pídele que cree su cuenta y, en “Unirme a un hogar”, escriba este código. Verán todo el mismo presupuesto.</p>
          <div className="rounded-xl bg-fondo p-4 text-center font-mono text-2xl font-bold tracking-widest">{hogar.codigo_invitacion}</div>
          <p className="mt-3 text-xs text-tenue">Miembros con cuenta: {miembros?.length ?? 0}</p>
        </Panel>

        <Panel titulo="Parámetros" className="lg:col-span-2">
          <form action={actualizarHogar} className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <input type="hidden" name="volver" value={volver} />
            <Campo etiqueta="Nombre del hogar"><input name="nombre" required defaultValue={hogar.nombre} className={claseInput} /></Campo>
            <Campo etiqueta="Año de trabajo"><input name="anio_trabajo" inputMode="numeric" defaultValue={hogar.anio_trabajo} className={claseInput} /></Campo>
            <Campo etiqueta="Tasa de cambio (RD$ por US$)"><input name="tasa_cambio_usd" inputMode="decimal" defaultValue={num(hogar.tasa_cambio_usd)} className={claseInput} /></Campo>
            <Campo etiqueta="Meta de ahorro (% del ingreso)"><input name="meta_ahorro" inputMode="decimal" defaultValue={+(num(hogar.meta_ahorro) * 100).toFixed(2)} className={claseInput} /></Campo>
            <Campo etiqueta="Límite de deuda (% del ingreso)"><input name="limite_deuda" inputMode="decimal" defaultValue={+(num(hogar.limite_deuda) * 100).toFixed(2)} className={claseInput} /></Campo>
            <Campo etiqueta="Fondo de emergencia (meses de gasto)"><input name="meses_fondo_emergencia" inputMode="decimal" defaultValue={num(hogar.meses_fondo_emergencia)} className={claseInput} /></Campo>
            <div className="col-span-2 md:col-span-3"><button className={claseBoton}>Guardar parámetros</button></div>
          </form>
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Lista titulo="Responsables" tabla="personas" items={personas}
          detalle={(id) => (conCuenta.has(id) ? "tiene cuenta" : personas.find((p) => p.id === id)?.es_compartido ? "compartido" : null)} />
        <Lista titulo="Cuentas / bancos" tabla="cuentas" items={cuentas} />
        <Lista titulo="Categorías de gasto" tabla="categorias" tipo="gasto" items={categorias.filter((c) => c.tipo === "gasto")} />
        <Lista titulo="Categorías de ingreso" tabla="categorias" tipo="ingreso" items={categorias.filter((c) => c.tipo === "ingreso")} />
      </div>
    </>
  );
}
