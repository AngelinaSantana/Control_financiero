import Link from "next/link";
import { notFound } from "next/navigation";
import { guardarAbono } from "@/app/acciones";
import { BotonEliminar } from "@/components/BotonEliminar";
import { FormPrestamo } from "@/components/FormPrestamo";
import { Campo, Dato, Encabezado, Insignia, Mensajes, Panel, Vacio, claseBoton, claseBotonSec, claseInput } from "@/components/ui";
import { cargarDeudas } from "@/lib/cargas";
import { contexto } from "@/lib/datos";
import { formatoFecha, hoyISO } from "@/lib/fechas";
import { dinero, numero, porcentaje } from "@/lib/formato";
import { num } from "@/lib/tipos";

export default async function DetallePrestamo({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await contexto();
  const simulado = Math.max(Number(sp.abono) || 0, 0);

  const base = await cargarDeudas(ctx);
  const e = base.estadosPrestamos.find((x) => x.prestamo.id === id);
  if (!e) notFound();
  const sim = simulado ? (await cargarDeudas(ctx, { [id]: simulado })).estadosPrestamos.find((x) => x.prestamo.id === id)! : null;
  const p = e.prestamo;
  const abonos = base.abonos.filter((a) => a.prestamo_id === id);
  const volver = `/prestamos/${id}`;

  return (
    <>
      <Encabezado titulo={`${p.acreedor} – ${p.descripcion}`} subtitulo={`Tasa ${porcentaje(num(p.tasa_anual))} · base ${p.base_dias} días · ${p.cuotas_totales} cuotas`}>
        <Link href="/prestamos" className={claseBotonSec}>← Préstamos</Link>
      </Encabezado>
      <Mensajes error={sp.error} ok={sp.ok} />
      {e.alertas.map((a) => <div key={a} className="mb-2"><Insignia tono="aviso">{a}</Insignia></div>)}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato etiqueta="Saldo de capital hoy" valor={dinero(e.saldoActual)} detalle={`${e.cuotasPagadas} cuotas pagadas`} />
        <Dato etiqueta="Próxima cuota" valor={dinero(e.proxima?.cuota ?? 0)} detalle={e.proxima ? `${formatoFecha(e.proxima.fecha)} · interés ${dinero(e.proxima.interes)}` : "Saldado"} />
        <Dato etiqueta="Total pendiente" valor={dinero(e.totalPendiente)} detalle={`${e.cuotasRestantes} cuotas`} />
        <Dato etiqueta="Intereses + seguros pendientes" valor={dinero(e.interesesSegurosPendientes)} tono="aviso" detalle={`Termina ${formatoFecha(e.fechaFin)}`} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Panel titulo="Simular abono extra mensual" className="lg:col-span-2">
          <form className="flex flex-wrap items-end gap-2" action={volver}>
            <Campo etiqueta="Abono extra a capital cada mes (RD$)">
              <input name="abono" inputMode="decimal" defaultValue={simulado || ""} placeholder="2,000" className={claseInput} />
            </Campo>
            <button className={claseBoton}>Simular</button>
            {simulado > 0 && <Link href={volver} className={claseBotonSec}>Quitar</Link>}
          </form>
          {sim && (
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
              <div className="rounded-xl bg-fondo p-3">
                <div className="text-tenue">Terminarías</div>
                <div className="font-bold">{formatoFecha(sim.fechaFin)}</div>
                <div className="text-xs text-tenue">en vez de {formatoFecha(e.fechaFin)}</div>
              </div>
              <div className="rounded-xl bg-fondo p-3">
                <div className="text-tenue">Cuotas menos</div>
                <div className="font-bold">{e.cuotasRestantes - sim.cuotasRestantes}</div>
              </div>
              <div className="rounded-xl bg-fondo p-3">
                <div className="text-tenue">Ahorro en intereses y seguros</div>
                <div className="font-bold text-bueno">{dinero(e.interesesSegurosPendientes - sim.interesesSegurosPendientes)}</div>
              </div>
            </div>
          )}
        </Panel>

        <Panel titulo="Abonos extra realizados">
          <form action={guardarAbono} className="mb-3 grid grid-cols-2 gap-2">
            <input type="hidden" name="volver" value={volver} />
            <input type="hidden" name="prestamo_id" value={id} />
            <input type="date" name="fecha" required defaultValue={hoyISO()} className={claseInput} aria-label="Fecha" />
            <input name="monto" required inputMode="decimal" placeholder="Monto" className={claseInput} aria-label="Monto" />
            <input name="notas" placeholder="Notas" className={`${claseInput} col-span-2`} aria-label="Notas" />
            <button className={`${claseBoton} col-span-2`}>Registrar abono</button>
          </form>
          {abonos.length === 0 ? <p className="text-sm text-tenue">Sin abonos extra.</p> : (
            <ul className="divide-y divide-borde text-sm">
              {abonos.map((a) => (
                <li key={a.id} className="flex justify-between gap-2 py-1.5">
                  <span>{formatoFecha(a.fecha)}</span>
                  <span className="tabular-nums">{dinero(num(a.monto))}</span>
                  <BotonEliminar tabla="prestamo_abonos" id={a.id} volver={volver} texto="×" />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel titulo={sim ? "Tabla de amortización (con abono simulado)" : "Tabla de amortización"} className="mb-4">
        {(sim ?? e).filas.length === 0 ? <Vacio>Sin cuotas pendientes.</Vacio> : (
          <div className="desplazable max-h-[32rem] overflow-y-auto">
            <table className="tabla">
              <thead className="sticky top-0 bg-superficie">
                <tr>
                  <th className="num">#</th><th>Fecha</th><th className="num">Días</th><th className="num">Saldo inicial</th>
                  <th className="num">Interés</th><th className="num">Seguro</th><th className="num">Capital</th>
                  <th className="num">Abono extra</th><th className="num">Cuota</th><th className="num">Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {(sim ?? e).filas.map((f) => (
                  <tr key={f.n} className={f.pagada ? "text-tenue" : ""}>
                    <td className="num">{f.n}{f.pagada ? " ✓" : ""}</td>
                    <td className="whitespace-nowrap">{formatoFecha(f.fecha)}</td>
                    <td className="num">{f.dias}</td>
                    <td className="num">{numero(f.saldoInicial)}</td>
                    <td className="num">{numero(f.interes)}</td>
                    <td className="num">{numero(f.seguro)}</td>
                    <td className="num">{numero(f.capital)}</td>
                    <td className="num">{f.abonoExtra ? numero(f.abonoExtra) : ""}</td>
                    <td className="num font-semibold">{numero(f.cuota)}</td>
                    <td className="num">{numero(f.saldoFinal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-tenue">Interés = saldo × (tasa anual ÷ base de días) × días del período. La cuota incluye el seguro.</p>
      </Panel>

      <details className="rounded-2xl border border-borde bg-superficie p-4 shadow-sm sm:p-5">
        <summary className="cursor-pointer font-semibold">Editar datos del préstamo</summary>
        <div className="mt-4"><FormPrestamo volver={volver} personas={ctx.personas} p={p} /></div>
        <div className="mt-4 border-t border-borde pt-3">
          <BotonEliminar tabla="prestamos" id={p.id} volver="/prestamos" texto="Eliminar préstamo" />
        </div>
      </details>
    </>
  );
}
