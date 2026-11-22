import { actualizarMetaFondo, agregarCatalogo, guardarMovAhorro } from "@/app/acciones";
import { BotonEliminar } from "@/components/BotonEliminar";
import { Barra, Campo, Dato, Encabezado, Mensajes, Panel, Seleccion, Vacio, claseBoton, claseBotonSec, claseInput } from "@/components/ui";
import { contexto, leerTodo, mapaNombres } from "@/lib/datos";
import { formatoFecha, hoyISO } from "@/lib/fechas";
import { resumenAnual, saldosAhorro } from "@/lib/finanzas/resumen";
import { cargarAnio } from "@/lib/cargas";
import { dinero } from "@/lib/formato";
import { num, type FondoAhorro, type MovAhorro } from "@/lib/tipos";

export default async function Ahorros({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await contexto();
  const { supabase, personas, cuentas, hogar, categorias } = ctx;
  const anio = new Date().getFullYear();
  const [fondos, movs, datosAnio] = await Promise.all([
    leerTodo<FondoAhorro>(supabase, "fondos_ahorro", undefined, { columna: "orden" }),
    leerTodo<MovAhorro>(supabase, "ahorro_movimientos", undefined, { columna: "fecha", asc: false }),
    cargarAnio(ctx, anio),
  ]);
  const saldos = saldosAhorro(fondos, movs);
  const total = [...saldos.values()].reduce((s, x) => s + x.saldo, 0);
  const nFondo = mapaNombres(fondos);
  const nPersona = mapaNombres(personas);

  // Meta de fondo de emergencia = meses × gasto promedio mensual
  const r = resumenAnual(anio, datosAnio.ingresos, datosAnio.gastos, datosAnio.ahorros, categorias);
  const metaEmergencia = num(hogar.meses_fondo_emergencia) * r.promedio.gastos;
  const emergencia = fondos.find((f) => f.nombre.toLowerCase().includes("emergencia"));
  const saldoEmergencia = emergencia ? saldos.get(emergencia.id)?.saldo ?? 0 : 0;

  return (
    <>
      <Encabezado titulo="Ahorros" subtitulo="Aportes y retiros por fondo" />
      <Mensajes error={sp.error} ok={sp.ok} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Dato etiqueta="Total ahorrado" valor={dinero(total)} tono="bueno" />
        <Dato etiqueta={`Ahorro neto ${anio}`} valor={dinero(r.total.ahorro)} />
        <Dato
          etiqueta="Fondo de emergencia"
          valor={metaEmergencia > 0 ? `${Math.round((saldoEmergencia / metaEmergencia) * 100)} %` : "—"}
          detalle={`Meta: ${num(hogar.meses_fondo_emergencia)} meses de gasto ≈ ${dinero(metaEmergencia)}`}
          tono={saldoEmergencia >= metaEmergencia && metaEmergencia > 0 ? "bueno" : "aviso"}
        />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fondos.map((f) => {
          const s = saldos.get(f.id)!;
          const meta = num(f.meta);
          return (
            <Panel key={f.id}>
              <div className="text-sm font-semibold">{f.nombre}</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{dinero(s.saldo)}</div>
              <div className="mb-2 text-xs text-tenue">Aportes {dinero(s.aportes)} · Retiros {dinero(s.retiros)}</div>
              {meta > 0 && (<><Barra valor={s.saldo / meta} tono="bueno" /><div className="mt-1 text-xs text-tenue">Meta {dinero(meta)}</div></>)}
              <form action={actualizarMetaFondo} className="mt-2 flex gap-1">
                <input type="hidden" name="volver" value="/ahorros" />
                <input type="hidden" name="id" value={f.id} />
                <input name="meta" inputMode="decimal" defaultValue={meta || ""} placeholder="Meta" className={`${claseInput} py-1`} aria-label={`Meta de ${f.nombre}`} />
                <button className={`${claseBotonSec} py-1`}>OK</button>
              </form>
            </Panel>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel titulo="Registrar aporte o retiro">
          <form action={guardarMovAhorro} className="grid grid-cols-2 gap-3">
            <input type="hidden" name="volver" value="/ahorros" />
            <Campo etiqueta="Fondo" className="col-span-2">
              <Seleccion name="fondo_id" required opciones={fondos.map((f) => ({ valor: f.id, etiqueta: f.nombre }))} />
            </Campo>
            <Campo etiqueta="Movimiento">
              <Seleccion name="tipo" valor="aporte" opciones={[{ valor: "aporte", etiqueta: "Aporte" }, { valor: "retiro", etiqueta: "Retiro" }]} />
            </Campo>
            <Campo etiqueta="Fecha"><input type="date" name="fecha" required defaultValue={hoyISO()} className={claseInput} /></Campo>
            <Campo etiqueta="Monto (RD$)"><input name="monto" required inputMode="decimal" className={claseInput} /></Campo>
            <Campo etiqueta="Responsable">
              <Seleccion name="persona_id" vacio="—" valor={ctx.miPersonaId} opciones={personas.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} />
            </Campo>
            <Campo etiqueta="Cuenta">
              <Seleccion name="cuenta_id" vacio="—" opciones={cuentas.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} />
            </Campo>
            <Campo etiqueta="Notas"><input name="notas" className={claseInput} /></Campo>
            <div className="col-span-2"><button className={claseBoton}>Registrar</button></div>
          </form>
          <form action={agregarCatalogo} className="mt-5 flex gap-2 border-t border-borde pt-4">
            <input type="hidden" name="volver" value="/ahorros" />
            <input type="hidden" name="tabla" value="fondos_ahorro" />
            <input name="nombre" required placeholder="Nuevo fondo (ej. Vacaciones)" className={claseInput} />
            <button className={claseBotonSec}>Crear</button>
          </form>
        </Panel>

        <Panel titulo="Movimientos" className="lg:col-span-2">
          {movs.length === 0 ? <Vacio>Sin movimientos de ahorro.</Vacio> : (
            <div className="desplazable">
              <table className="tabla">
                <thead><tr><th>Fecha</th><th>Fondo</th><th>Responsable</th><th>Movimiento</th><th className="num">Monto</th><th>Notas</th><th></th></tr></thead>
                <tbody>
                  {movs.map((m) => (
                    <tr key={m.id}>
                      <td>{formatoFecha(m.fecha)}</td>
                      <td>{nFondo.get(m.fondo_id)}</td>
                      <td>{nPersona.get(m.persona_id ?? "") ?? "—"}</td>
                      <td className={m.tipo === "aporte" ? "text-bueno" : "text-malo"}>{m.tipo === "aporte" ? "Aporte" : "Retiro"}</td>
                      <td className="num">{dinero(num(m.monto))}</td>
                      <td className="text-tenue">{m.notas}</td>
                      <td><BotonEliminar tabla="ahorro_movimientos" id={m.id} volver="/ahorros" texto="×" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
