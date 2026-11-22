import Link from "next/link";
import { guardarPagoPersonal, guardarPersonal } from "@/app/acciones";
import { BotonEliminar } from "@/components/BotonEliminar";
import { Barra, Campo, Dato, Encabezado, Insignia, Mensajes, Panel, Seleccion, Vacio, claseBoton, claseBotonSec, claseInput } from "@/components/ui";
import { contexto, leerTodo, mapaNombres } from "@/lib/datos";
import { formatoFecha, hoyISO } from "@/lib/fechas";
import { estadoPersonales, type EstadoPersonal } from "@/lib/finanzas/resumen";
import { dinero } from "@/lib/formato";
import { num, type PagoPersonal, type PrestamoPersonal } from "@/lib/tipos";

export default async function Personales({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await contexto();
  const [prestamos, pagos] = await Promise.all([
    leerTodo<PrestamoPersonal>(ctx.supabase, "prestamos_personales", undefined, { columna: "fecha", asc: false }),
    leerTodo<PagoPersonal>(ctx.supabase, "prestamo_personal_pagos", undefined, { columna: "fecha" }),
  ]);
  const estados = estadoPersonales(prestamos, pagos);
  const nPersona = mapaNombres(ctx.personas);
  const editar = sp.editar ? prestamos.find((p) => p.id === sp.editar) : undefined;

  const meDeben = estados.filter((e) => e.prestamo.direccion === "me_deben");
  const debo = estados.filter((e) => e.prestamo.direccion === "debo");
  const suma = (l: EstadoPersonal[]) => l.reduce((s, e) => s + Math.max(e.saldo, 0), 0);

  const Lista = ({ titulo, lista }: { titulo: string; lista: EstadoPersonal[] }) => (
    <Panel titulo={titulo}>
      {lista.length === 0 ? <Vacio>Nada por aquí.</Vacio> : (
        <ul className="space-y-4">
          {lista.map((e) => {
            const p = e.prestamo;
            const saldado = e.saldo <= 0.005;
            return (
              <li key={p.id} className="rounded-xl border border-borde p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{p.contraparte} {saldado && <Insignia tono="bueno">Saldado</Insignia>}</div>
                    <div className="text-xs text-tenue">
                      {formatoFecha(p.fecha)} · {nPersona.get(p.persona_id ?? "") ?? "—"}
                      {p.fecha_limite && ` · límite ${formatoFecha(p.fecha_limite)}`}
                    </div>
                    {p.notas && <div className="text-xs text-tenue">{p.notas}</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-bold tabular-nums">{dinero(e.saldo)}</div>
                    <div className="text-xs text-tenue">de {dinero(num(p.monto))}</div>
                  </div>
                </div>
                <div className="my-2"><Barra valor={num(p.monto) ? e.pagado / num(p.monto) : 0} tono="bueno" /></div>
                {e.pagos.length > 0 && (
                  <ul className="mb-2 text-xs text-tenue">
                    {e.pagos.map((x) => (
                      <li key={x.id} className="flex justify-between gap-2">
                        <span>{formatoFecha(x.fecha)} {x.notas && `· ${x.notas}`}</span>
                        <span className="tabular-nums">{dinero(num(x.monto))} <BotonEliminar tabla="prestamo_personal_pagos" id={x.id} volver="/personales" texto="×" /></span>
                      </li>
                    ))}
                  </ul>
                )}
                {!saldado && (
                  <form action={guardarPagoPersonal} className="flex flex-wrap gap-2">
                    <input type="hidden" name="volver" value="/personales" />
                    <input type="hidden" name="prestamo_personal_id" value={p.id} />
                    <input type="date" name="fecha" required defaultValue={hoyISO()} className={`${claseInput} w-auto py-1`} aria-label="Fecha del pago" />
                    <input name="monto" required inputMode="decimal" placeholder="Monto" className={`${claseInput} w-28 py-1`} aria-label="Monto del pago" />
                    <button className={`${claseBotonSec} py-1`}>Registrar pago</button>
                  </form>
                )}
                <div className="mt-2 flex gap-3">
                  <Link href={`/personales?editar=${p.id}`} className="text-xs font-medium text-marca hover:underline">Editar</Link>
                  <BotonEliminar tabla="prestamos_personales" id={p.id} volver="/personales" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );

  return (
    <>
      <Encabezado titulo="Préstamos personales" subtitulo="Dinero prestado entre personas: lo que te deben y lo que debes" />
      <Mensajes error={sp.error} ok={sp.ok} />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Dato etiqueta="Me deben" valor={dinero(suma(meDeben))} tono="bueno" />
        <Dato etiqueta="Debo" valor={dinero(suma(debo))} tono="malo" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Lista titulo="Me deben" lista={meDeben} />
        <Lista titulo="Debo" lista={debo} />
        <Panel titulo={editar ? "Editar préstamo personal" : "Nuevo préstamo personal"}>
          <form action={guardarPersonal} className="grid grid-cols-2 gap-3" key={editar?.id ?? "nuevo"}>
            <input type="hidden" name="volver" value="/personales" />
            {editar && <input type="hidden" name="id" value={editar.id} />}
            <Campo etiqueta="Persona" className="col-span-2">
              <input name="contraparte" required defaultValue={editar?.contraparte} placeholder="Melany, Ana, Francisco…" className={claseInput} />
            </Campo>
            <Campo etiqueta="Dirección">
              <Seleccion name="direccion" valor={editar?.direccion ?? "me_deben"} opciones={[
                { valor: "me_deben", etiqueta: "Yo presté (me deben)" }, { valor: "debo", etiqueta: "Me prestaron (debo)" },
              ]} />
            </Campo>
            <Campo etiqueta="Del hogar">
              <Seleccion name="persona_id" vacio="—" valor={editar?.persona_id ?? ctx.miPersonaId} opciones={ctx.personas.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} />
            </Campo>
            <Campo etiqueta="Monto (RD$)"><input name="monto" required inputMode="decimal" defaultValue={editar ? num(editar.monto) : ""} className={claseInput} /></Campo>
            <Campo etiqueta="Fecha"><input type="date" name="fecha" required defaultValue={editar?.fecha ?? hoyISO()} className={claseInput} /></Campo>
            <Campo etiqueta="Fecha límite (opcional)"><input type="date" name="fecha_limite" defaultValue={editar?.fecha_limite ?? ""} className={claseInput} /></Campo>
            <Campo etiqueta="Notas"><input name="notas" defaultValue={editar?.notas ?? ""} className={claseInput} /></Campo>
            <div className="col-span-2 flex gap-2">
              <button className={claseBoton}>{editar ? "Guardar" : "Agregar"}</button>
              {editar && <Link href="/personales" className={claseBotonSec}>Cancelar</Link>}
            </div>
          </form>
          <p className="mt-3 text-xs text-tenue">
            Estos movimientos no cuentan como ingreso ni gasto del hogar: así tus ingresos reales no se inflan cuando te devuelven dinero.
          </p>
        </Panel>
      </div>
    </>
  );
}
