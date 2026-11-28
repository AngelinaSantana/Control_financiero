import Link from "next/link";
import { GraficaMensual } from "@/components/GraficaMensual";
import { Barra, Dato, Encabezado, Panel, SelectorMes, Vacio, leerMes } from "@/components/ui";
import { PrioridadPlan } from "@/components/PrioridadPlan";
import { cargarAnio, cargarDeudas, prioridadesDelPlan } from "@/lib/cargas";
import { contexto, leerTodo, mapaNombres } from "@/lib/datos";
import { MESES_CORTOS, formatoFecha, mesDe } from "@/lib/fechas";
import { estadoPersonales, resumenAnual, saldosAhorro } from "@/lib/finanzas/resumen";
import { dinero, porcentaje } from "@/lib/formato";
import { esPagoTarjeta, num, type FondoAhorro, type MontoPresupuesto, type MovAhorro, type PagoPersonal, type PrestamoPersonal } from "@/lib/tipos";

export default async function Inicio({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await contexto();
  const [anio, mes] = leerMes(sp.mes);
  const { supabase, hogar, categorias } = ctx;

  const [{ ingresos, gastos, ahorros }, deudas, montos, fondos, todosAhorros, personales, pagosPers] = await Promise.all([
    cargarAnio(ctx, anio),
    cargarDeudas(ctx),
    leerTodo<MontoPresupuesto>(supabase, "presupuesto_montos", (q) => q.eq("anio", anio).eq("mes", mes)),
    leerTodo<FondoAhorro>(supabase, "fondos_ahorro", undefined, { columna: "orden" }),
    leerTodo<MovAhorro>(supabase, "ahorro_movimientos"),
    leerTodo<PrestamoPersonal>(supabase, "prestamos_personales"),
    leerTodo<PagoPersonal>(supabase, "prestamo_personal_pagos"),
  ]);

  const resumen = resumenAnual(anio, ingresos, gastos, ahorros, categorias);
  const plan = prioridadesDelPlan(deudas.estadosPrestamos, deudas.estadosTarjetas);
  const proximos = plan.orden.slice(0, 3).map((p) => ({ p, d: plan.deudas.find((x) => x.id === p.id)! }));
  const r = resumen.meses[mes - 1];
  const meta = num(hogar.meta_ahorro);
  const limite = num(hogar.limite_deuda);
  const planeado = montos.reduce((s, m) => s + num(m.monto), 0);

  // Gasto del mes por categoría
  const nombreCat = mapaNombres(categorias);
  const gastosMes = gastos.filter((g) => mesDe(g.fecha) === mes);
  const porCat = new Map<string, number>();
  for (const g of gastosMes.filter((g) => !esPagoTarjeta(g))) {
    const n = nombreCat.get(g.categoria_id ?? "") ?? "Sin categoría";
    porCat.set(n, (porCat.get(n) ?? 0) + num(g.monto));
  }
  const cats = [...porCat.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] ?? 1;

  const deudaPrestamos = deudas.estadosPrestamos.reduce((s, e) => s + e.saldoActual, 0);
  const deudaTarjetas = deudas.estadosTarjetas.reduce((s, e) => s + Math.max(e.saldo, 0) * e.aRD, 0);
  const cuotasMes = deudas.estadosPrestamos.reduce((s, e) => s + (e.proxima?.cuota ?? 0), 0);
  const pers = estadoPersonales(personales, pagosPers);
  const meDeben = pers.filter((p) => p.prestamo.direccion === "me_deben").reduce((s, p) => s + Math.max(p.saldo, 0), 0);
  const debo = pers.filter((p) => p.prestamo.direccion === "debo").reduce((s, p) => s + Math.max(p.saldo, 0), 0);
  const ahorroTotal = [...saldosAhorro(fondos, todosAhorros).values()].reduce((s, x) => s + x.saldo, 0);

  const datosGrafica = resumen.meses.map((m, i) => ({ mes: MESES_CORTOS[i], ingresos: m.ingresos, gastos: m.gastos }));
  const ultimos = [
    ...ingresos.filter((i) => mesDe(i.fecha) === mes).map((i) => ({ ...i, es: "ingreso" as const })),
    ...gastosMes.map((g) => ({ ...g, es: "gasto" as const })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 8);

  return (
    <>
      <Encabezado titulo="Inicio" subtitulo="Cómo va el mes del hogar">
        <SelectorMes ruta="/" anio={anio} mes={mes} />
        <Link href="/movimientos?nuevo=gasto" className="rounded-lg bg-marca px-4 py-2 text-sm font-semibold text-white hover:bg-marca-oscuro">+ Registrar</Link>
      </Encabezado>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Dato etiqueta="Ingresos" valor={dinero(r.ingresos)} />
        <Dato etiqueta="Gastos" valor={dinero(r.gastos)} detalle={r.pctGasto !== null ? `${porcentaje(r.pctGasto)} del ingreso` : undefined} />
        <Dato etiqueta="Flujo neto" valor={dinero(r.flujoNeto)} tono={r.flujoNeto >= 0 ? "bueno" : "malo"} />
        <Dato
          etiqueta="Tasa de ahorro"
          valor={porcentaje(r.tasaAhorro)}
          detalle={`Meta ${porcentaje(meta)} · ahorrado ${dinero(r.ahorro)}`}
          tono={r.tasaAhorro !== null && r.tasaAhorro >= meta ? "bueno" : "aviso"}
        />
        <Dato
          etiqueta="Deuda / ingreso"
          valor={porcentaje(r.pctDeuda)}
          detalle={`Límite ${porcentaje(limite)} · pagado ${dinero(r.servicioDeuda)}`}
          tono={r.pctDeuda !== null && r.pctDeuda > limite ? "malo" : "bueno"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel titulo={`Ingresos y gastos ${anio}`} className="lg:col-span-2">
          <GraficaMensual datos={datosGrafica} />
        </Panel>

        <Panel titulo="Presupuesto del mes" accion={<Link href="/reportes" className="text-sm text-marca hover:underline">Detalle</Link>}>
          {planeado > 0 ? (
            <>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-tenue">Gastado</span>
                <span className="font-semibold tabular-nums">{dinero(r.gastos)}</span>
              </div>
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span className="text-tenue">Planeado</span>
                <span className="tabular-nums">{dinero(planeado)}</span>
              </div>
              <Barra valor={r.gastos / planeado} tono={r.gastos > planeado ? "malo" : "marca"} />
              <p className="mt-2 text-xs text-tenue">
                {r.gastos > planeado
                  ? `Te pasaste ${dinero(r.gastos - planeado)} del plan.`
                  : `Quedan ${dinero(planeado - r.gastos)} disponibles del plan.`}
              </p>
            </>
          ) : (
            <Vacio>No hay presupuesto para este mes. <Link href="/presupuesto" className="text-marca">Crearlo</Link></Vacio>
          )}

          <h3 className="mt-5 mb-2 text-sm font-semibold">Patrimonio y deudas</h3>
          <dl className="space-y-1 text-sm">
            <Fila etiqueta="Ahorros" valor={dinero(ahorroTotal)} />
            <Fila etiqueta="Préstamos (saldo)" valor={dinero(deudaPrestamos)} />
            <Fila etiqueta="Tarjetas (saldo)" valor={dinero(deudaTarjetas)} />
            <Fila etiqueta="Cuotas de préstamos / mes" valor={dinero(cuotasMes)} />
            <Fila etiqueta="Me deben (personales)" valor={dinero(meDeben)} />
            <Fila etiqueta="Debo (personales)" valor={dinero(debo)} />
          </dl>
        </Panel>
      </div>

      {proximos.length > 0 && (
        <Panel
          titulo="Tus próximas prioridades con las deudas"
          className="mt-4"
          accion={<Link href="/analisis" className="text-sm text-marca hover:underline">Simular un abono</Link>}
        >
          <ol className="grid gap-3 md:grid-cols-3">
            {proximos.map(({ p, d }) => (
              <li key={p.id} className="rounded-xl bg-fondo p-3 text-sm">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <span className="font-semibold">{d.nombre}</span>
                  <PrioridadPlan p={p} total={plan.total} />
                </div>
                <div className="mb-1 tabular-nums text-tenue">Saldo {dinero(d.saldo)}</div>
                <p className="text-xs text-tenue">{p.motivo}</p>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel titulo="Gasto por categoría">
          {cats.length === 0 ? <Vacio>Sin gastos este mes.</Vacio> : (
            <ul className="space-y-3">
              {cats.map(([n, v]) => (
                <li key={n}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{n}</span>
                    <span className="tabular-nums text-tenue">{dinero(v)} · {porcentaje(r.gastos ? v / r.gastos : null)}</span>
                  </div>
                  <Barra valor={v / maxCat} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel titulo="Últimos movimientos" accion={<Link href={`/movimientos?mes=${anio}-${String(mes).padStart(2, "0")}`} className="text-sm text-marca hover:underline">Ver todos</Link>}>
          {ultimos.length === 0 ? <Vacio>Sin movimientos este mes.</Vacio> : (
            <ul className="divide-y divide-borde">
              {ultimos.map((m) => (
                <li key={m.es + m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.concepto}</div>
                    <div className="text-xs text-tenue">
                      {formatoFecha(m.fecha)} · {m.es === "gasto" && esPagoTarjeta(m) ? "Pago a tarjeta (no suma)" : nombreCat.get(m.categoria_id ?? "") ?? "—"}
                    </div>
                  </div>
                  <span className={`shrink-0 font-semibold tabular-nums ${m.es === "ingreso" ? "text-bueno" : ""}`}>
                    {m.es === "ingreso" ? "+" : "−"}{dinero(num(m.monto))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-tenue">{etiqueta}</dt>
      <dd className="font-medium tabular-nums">{valor}</dd>
    </div>
  );
}
