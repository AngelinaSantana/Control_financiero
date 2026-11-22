import Link from "next/link";
import { guardarMovTarjeta, guardarTarjeta } from "@/app/acciones";
import { BotonEliminar } from "@/components/BotonEliminar";
import { Barra, Campo, Dato, Encabezado, Insignia, Mensajes, Panel, Seleccion, Vacio, claseBoton, claseBotonSec, claseInput } from "@/components/ui";
import { cargarDeudas } from "@/lib/cargas";
import { contexto, mapaNombres } from "@/lib/datos";
import { formatoFecha, hoyISO } from "@/lib/fechas";
import { nivelUtilizacion } from "@/lib/finanzas/tarjetas";
import { dinero, porcentaje } from "@/lib/formato";
import { num, type Tarjeta } from "@/lib/tipos";

export default async function Tarjetas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await contexto();
  const { estadosTarjetas, movsTarjeta, gastosEnlazados } = await cargarDeudas(ctx);
  const nPersona = mapaNombres(ctx.personas);
  const activas = estadosTarjetas.filter((e) => e.tarjeta.activa);
  const editar = sp.editar ? estadosTarjetas.find((e) => e.tarjeta.id === sp.editar)?.tarjeta : undefined;
  const nTarjeta = new Map(estadosTarjetas.map((e) => [e.tarjeta.id, e.tarjeta]));

  const rd = (n: number, f: number) => n * f;
  const saldo = activas.reduce((s, e) => s + rd(e.saldo, e.aRD), 0);
  const limite = activas.reduce((s, e) => s + rd(e.limite, e.aRD), 0);
  const interes = activas.reduce((s, e) => s + rd(e.interesEstimado, e.aRD), 0);
  const sobregiro = activas.reduce((s, e) => s + rd(e.sobregiro, e.aRD), 0);
  // Movimientos manuales + gastos enlazados (compras "pagado con" y pagos "a" la tarjeta)
  const recientes = [
    ...movsTarjeta.map((m) => ({ ...m, origen: "tarjeta" as const, montoTarjeta: num(m.monto) })),
    ...gastosEnlazados.flatMap((g) => {
      const tid = g.pagado_con_tarjeta_id ?? g.tarjeta_id;
      const t = tid ? nTarjeta.get(tid) : undefined;
      if (!t || g.fecha <= t.fecha_referencia) return [];
      const aRD = t.moneda === "USD" ? num(ctx.hogar.tasa_cambio_usd) || 1 : 1;
      return [{
        id: g.id, tarjeta_id: t.id, fecha: g.fecha, descripcion: g.concepto,
        tipo: (g.pagado_con_tarjeta_id ? "consumo" : "pago") as "consumo" | "pago",
        monto: g.monto, origen: "gasto" as const, montoTarjeta: num(g.monto) / aRD,
      }];
    }),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 20);

  return (
    <>
      <Encabezado titulo="Tarjetas de crédito" subtitulo={`Saldo, utilización, sobregiro e interés. US$ a RD$${num(ctx.hogar.tasa_cambio_usd)}`} />
      <Mensajes error={sp.error} ok={sp.ok} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato etiqueta="Saldo total (RD$)" valor={dinero(saldo)} detalle={`Límite ${dinero(limite)}`} />
        <Dato etiqueta="Utilización total" valor={porcentaje(limite ? saldo / limite : null)} tono={nivelUtilizacion(limite ? saldo / limite : null) === "alto" ? "malo" : "normal"} />
        <Dato etiqueta="Interés estimado del mes" valor={dinero(interes)} tono="aviso" />
        <Dato etiqueta="Sobregiro" valor={dinero(sobregiro)} tono={sobregiro > 0 ? "malo" : "bueno"} />
      </div>

      <Panel titulo="Mis tarjetas" className="mb-4">
        {activas.length === 0 ? <Vacio>No hay tarjetas registradas.</Vacio> : (
          <div className="desplazable">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Tarjeta</th><th>Resp.</th><th className="num">Saldo</th><th>Utilización</th><th className="num">Pago mín.</th>
                  <th className="num">Pago programado</th><th className="num">Interés mes</th><th className="num">Meses p/ saldar</th><th>Corte / pago</th><th></th>
                </tr>
              </thead>
              <tbody>
                {activas.map((e) => {
                  const t = e.tarjeta;
                  const nivel = nivelUtilizacion(e.utilizacion);
                  return (
                    <tr key={t.id}>
                      <td>
                        <div className="font-semibold">{t.nombre}</div>
                        <div className="text-xs text-tenue">Tasa {porcentaje(num(t.tasa_anual))} · {t.moneda === "USD" ? "Dólares" : "Pesos"}</div>
                        {e.sobregiro > 0 && <Insignia tono="malo">Sobregiro {dinero(e.sobregiro, t.moneda)}</Insignia>}
                      </td>
                      <td>{nPersona.get(t.persona_id ?? "") ?? "—"}</td>
                      <td className="num font-semibold">{dinero(e.saldo, t.moneda)}<div className="text-xs font-normal text-tenue">de {dinero(e.limite, t.moneda)}</div></td>
                      <td className="min-w-28">
                        <Barra valor={e.utilizacion ?? 0} tono={nivel === "alto" ? "malo" : nivel === "medio" ? "aviso" : "bueno"} />
                        <div className="mt-1 text-xs text-tenue">{porcentaje(e.utilizacion)}</div>
                      </td>
                      <td className="num">{t.pago_minimo !== null ? dinero(num(t.pago_minimo), t.moneda) : "—"}</td>
                      <td className="num">{t.pago_programado !== null ? dinero(num(t.pago_programado), t.moneda) : "—"}</td>
                      <td className="num">{dinero(e.interesEstimado, t.moneda)}</td>
                      <td className="num">
                        {e.mesesParaSaldar === null ? "—" : e.mesesParaSaldar === Infinity ? <Insignia tono="malo">No alcanza</Insignia> : e.mesesParaSaldar.toFixed(1)}
                      </td>
                      <td className="whitespace-nowrap">{t.dia_corte ?? "—"} / {t.dia_pago ?? "—"}</td>
                      <td><Link href={`/tarjetas?editar=${t.id}`} className="text-xs font-medium text-marca hover:underline">Editar</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-tenue">
          Por encima de 30% de utilización afecta tu perfil de crédito; por encima de 80% es alarma. Si pagas el 100% antes de la fecha límite, el interés es cero.
          Lo más cómodo: registra tus compras en Movimientos con <strong>“Pagado con: tarjeta”</strong> (suben la deuda y cuentan como gasto de su categoría)
          y los pagos con <strong>“¿Es un pago A una tarjeta?”</strong> (bajan la deuda y no se suman otra vez como gasto).
          Usa este formulario sólo para lo que no es un gasto del hogar: intereses, comisiones o ajustes.
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel titulo="Movimiento manual (intereses, comisiones, ajustes)">
          <form action={guardarMovTarjeta} className="grid grid-cols-2 gap-3">
            <input type="hidden" name="volver" value="/tarjetas" />
            <Campo etiqueta="Tarjeta" className="col-span-2">
              <Seleccion name="tarjeta_id" required opciones={activas.map((e) => ({ valor: e.tarjeta.id, etiqueta: e.tarjeta.nombre }))} />
            </Campo>
            <Campo etiqueta="Tipo">
              <Seleccion name="tipo" valor="cargo" opciones={[
                { valor: "consumo", etiqueta: "Consumo" }, { valor: "pago", etiqueta: "Pago" }, { valor: "cargo", etiqueta: "Cargo / interés" },
              ]} />
            </Campo>
            <Campo etiqueta="Fecha">
              <input type="date" name="fecha" required defaultValue={hoyISO()} className={claseInput} />
            </Campo>
            <Campo etiqueta="Monto (moneda de la tarjeta)">
              <input name="monto" required inputMode="decimal" className={claseInput} />
            </Campo>
            <Campo etiqueta="Descripción">
              <input name="descripcion" className={claseInput} />
            </Campo>
            <div className="col-span-2"><button className={claseBoton}>Registrar</button></div>
          </form>
          <h3 className="mt-5 mb-2 text-sm font-semibold">Últimos movimientos</h3>
          {recientes.length === 0 ? <p className="text-sm text-tenue">Sin movimientos.</p> : (
            <ul className="divide-y divide-borde text-sm">
              {recientes.map((m) => {
                const t = nTarjeta.get(m.tarjeta_id);
                return (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-1.5">
                    <div className="min-w-0">
                      <div className="truncate">{m.descripcion || m.tipo} <span className="text-xs text-tenue">· {t?.nombre}</span></div>
                      <div className="text-xs text-tenue">{formatoFecha(m.fecha)} · {m.tipo}{m.origen === "gasto" ? " · desde Movimientos" : ""}</div>
                    </div>
                    <span className={`tabular-nums ${m.tipo === "pago" ? "text-bueno" : ""}`}>{m.tipo === "pago" ? "−" : "+"}{dinero(m.montoTarjeta, t?.moneda)}</span>
                    {m.origen === "tarjeta" ? <BotonEliminar tabla="tarjeta_movimientos" id={m.id} volver="/tarjetas" texto="×" /> : <span className="w-3" />}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel titulo={editar ? `Editar ${editar.nombre}` : "Agregar tarjeta"}>
          <FormTarjeta t={editar} personas={ctx.personas} />
          {editar && (
            <div className="mt-3 flex items-center gap-4">
              <Link href="/tarjetas" className={claseBotonSec}>Cancelar</Link>
              <BotonEliminar tabla="tarjetas" id={editar.id} volver="/tarjetas" texto="Eliminar tarjeta" />
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function FormTarjeta({ t, personas }: { t?: Tarjeta; personas: { id: string; nombre: string }[] }) {
  const v = (n: unknown) => (n === null || n === undefined ? "" : String(n));
  return (
    <form action={guardarTarjeta} className="grid grid-cols-2 gap-3" key={t?.id ?? "nueva"}>
      <input type="hidden" name="volver" value="/tarjetas" />
      {t && <input type="hidden" name="id" value={t.id} />}
      <Campo etiqueta="Nombre" className="col-span-2"><input name="nombre" required defaultValue={t?.nombre} className={claseInput} /></Campo>
      <Campo etiqueta="Responsable">
        <Seleccion name="persona_id" vacio="—" valor={t?.persona_id} opciones={personas.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} />
      </Campo>
      <Campo etiqueta="Moneda">
        <Seleccion name="moneda" valor={t?.moneda ?? "DOP"} opciones={[{ valor: "DOP", etiqueta: "RD$ Pesos" }, { valor: "USD", etiqueta: "US$ Dólares" }]} />
      </Campo>
      <Campo etiqueta="Límite"><input name="limite" inputMode="decimal" defaultValue={v(t?.limite)} className={claseInput} /></Campo>
      <Campo etiqueta="Tasa anual (%)"><input name="tasa_anual" inputMode="decimal" defaultValue={t ? +(num(t.tasa_anual) * 100).toFixed(2) : 60} className={claseInput} /></Campo>
      <Campo etiqueta="Día de corte"><input name="dia_corte" inputMode="numeric" defaultValue={v(t?.dia_corte)} className={claseInput} /></Campo>
      <Campo etiqueta="Día límite de pago"><input name="dia_pago" inputMode="numeric" defaultValue={v(t?.dia_pago)} className={claseInput} /></Campo>
      <Campo etiqueta="Pago mínimo"><input name="pago_minimo" inputMode="decimal" defaultValue={v(t?.pago_minimo)} className={claseInput} /></Campo>
      <Campo etiqueta="Pago programado"><input name="pago_programado" inputMode="decimal" defaultValue={v(t?.pago_programado)} className={claseInput} /></Campo>
      <Campo etiqueta="Saldo conocido"><input name="saldo_referencia" inputMode="decimal" defaultValue={v(t?.saldo_referencia)} className={claseInput} /></Campo>
      <Campo etiqueta="A la fecha"><input type="date" name="fecha_referencia" required defaultValue={t?.fecha_referencia ?? hoyISO()} className={claseInput} /></Campo>
      <p className="col-span-2 text-xs text-tenue">El saldo actual = saldo conocido + consumos − pagos registrados después de esa fecha. Actualízalo con cada estado de cuenta si quieres.</p>
      <div className="col-span-2"><button className={claseBoton}>{t ? "Guardar" : "Agregar tarjeta"}</button></div>
    </form>
  );
}
