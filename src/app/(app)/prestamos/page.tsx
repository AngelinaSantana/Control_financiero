import Link from "next/link";
import { FormPrestamo } from "@/components/FormPrestamo";
import { Barra, Dato, Encabezado, Insignia, Mensajes, Panel, Vacio } from "@/components/ui";
import { cargarDeudas } from "@/lib/cargas";
import { contexto, mapaNombres } from "@/lib/datos";
import { formatoFecha } from "@/lib/fechas";
import { prioridades } from "@/lib/finanzas/prestamos";
import { dinero, porcentaje } from "@/lib/formato";
import { num } from "@/lib/tipos";

export default async function Prestamos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await contexto();
  const { estadosPrestamos } = await cargarDeudas(ctx);
  const nPersona = mapaNombres(ctx.personas);
  const activos = estadosPrestamos.filter((e) => e.prestamo.activo);
  const archivados = estadosPrestamos.filter((e) => !e.prestamo.activo);
  const prio = prioridades(activos);

  const saldo = activos.reduce((s, e) => s + e.saldoActual, 0);
  const original = activos.reduce((s, e) => s + num(e.prestamo.monto_original), 0);
  const cuotas = activos.reduce((s, e) => s + (e.proxima?.cuota ?? 0), 0);
  const pendiente = activos.reduce((s, e) => s + e.totalPendiente, 0);
  const intereses = activos.reduce((s, e) => s + e.interesesSegurosPendientes, 0);

  return (
    <>
      <Encabezado titulo="Préstamos" subtitulo="Capital, interés por días, seguros y plazo" />
      <Mensajes error={sp.error} ok={sp.ok} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato etiqueta="Saldo de capital" valor={dinero(saldo)} detalle={`de ${dinero(original)} prestados`} />
        <Dato etiqueta="Cuotas del mes" valor={dinero(cuotas)} />
        <Dato etiqueta="Total pendiente" valor={dinero(pendiente)} />
        <Dato etiqueta="Intereses + seguros por pagar" valor={dinero(intereses)} tono="aviso" />
      </div>

      <Panel titulo="Préstamos activos" className="mb-4">
        {activos.length === 0 ? <Vacio>No hay préstamos activos.</Vacio> : (
          <div className="desplazable">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Préstamo</th><th>Responsable</th><th className="num">Tasa</th><th className="num">Saldo</th><th>Avance</th>
                  <th className="num">Cuota</th><th>Próxima</th><th>Termina</th><th className="num" title="Avalancha: mayor tasa primero">Aval.</th>
                  <th className="num" title="Bola de nieve: menor saldo primero">B. nieve</th>
                </tr>
              </thead>
              <tbody>
                {activos.map((e) => {
                  const p = e.prestamo;
                  const avance = num(p.monto_original) > 0 ? 1 - e.saldoActual / num(p.monto_original) : 0;
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/prestamos/${p.id}`} className="font-semibold text-marca hover:underline">{p.acreedor}</Link>
                        <div className="text-xs text-tenue">{p.descripcion}</div>
                        {e.alertas.map((a) => <div key={a} className="mt-1"><Insignia tono="aviso">{a}</Insignia></div>)}
                      </td>
                      <td>{nPersona.get(p.persona_id ?? "") ?? "—"}</td>
                      <td className="num">{porcentaje(num(p.tasa_anual))}</td>
                      <td className="num font-semibold">{dinero(e.saldoActual)}</td>
                      <td className="min-w-28">
                        <Barra valor={avance} tono="bueno" />
                        <div className="mt-1 text-xs text-tenue">{e.cuotasPagadas} pagadas · {e.cuotasRestantes} restantes</div>
                      </td>
                      <td className="num">{dinero(num(p.cuota_total))}</td>
                      <td className="whitespace-nowrap">{formatoFecha(e.proxima?.fecha)}</td>
                      <td className="whitespace-nowrap">{formatoFecha(e.fechaFin)}</td>
                      <td className="num">{prio.avalancha.get(p.id) ?? "—"}</td>
                      <td className="num">{prio.bolaDeNieve.get(p.id) ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-tenue">
          <strong>Avalancha</strong>: abona extra primero al de mayor tasa (ahorras más intereses). <strong>Bola de nieve</strong>: primero al de menor saldo (liberas cuotas más rápido).
          Para que el saldo baje solo, registra la cuota en Movimientos y elige el préstamo en “¿Es cuota de un préstamo?”.
        </p>
      </Panel>

      {archivados.length > 0 && (
        <Panel titulo="Saldados / archivados" className="mb-4">
          <ul className="text-sm">
            {archivados.map((e) => (
              <li key={e.prestamo.id}><Link href={`/prestamos/${e.prestamo.id}`} className="text-marca hover:underline">{e.prestamo.acreedor} – {e.prestamo.descripcion}</Link></li>
            ))}
          </ul>
        </Panel>
      )}

      <details className="rounded-2xl border border-borde bg-superficie p-4 shadow-sm sm:p-5">
        <summary className="cursor-pointer font-semibold">+ Agregar préstamo</summary>
        <div className="mt-4"><FormPrestamo volver="/prestamos" personas={ctx.personas} /></div>
      </details>
    </>
  );
}
