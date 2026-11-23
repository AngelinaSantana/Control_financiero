import Link from "next/link";
import { Encabezado, Panel, claseBotonSec } from "@/components/ui";
import { cargarAnio, cargarDeudas } from "@/lib/cargas";
import { contexto, leerTodo } from "@/lib/datos";
import { MESES_CORTOS, partes } from "@/lib/fechas";
import { calendarioDeuda } from "@/lib/finanzas/prestamos";
import { desviaciones, resumenAnual, type FilaResumen } from "@/lib/finanzas/resumen";
import { numero, porcentaje } from "@/lib/formato";
import { num, type ConceptoPresupuesto, type MontoPresupuesto } from "@/lib/tipos";

const FILAS: { clave: keyof FilaResumen; etiqueta: string; tipo?: "pct"; grupo?: string; fuerte?: boolean }[] = [
  { clave: "ingresos", etiqueta: "Ingresos totales", grupo: "Ingresos", fuerte: true },
  { clave: "ingresosFijos", etiqueta: "Fijos" },
  { clave: "ingresosVariables", etiqueta: "Variables" },
  { clave: "ingresosUnicos", etiqueta: "Pago único" },
  { clave: "gastos", etiqueta: "Gastos totales", grupo: "Gastos", fuerte: true },
  { clave: "gastosFijos", etiqueta: "Fijos" },
  { clave: "gastosVariables", etiqueta: "Variables" },
  { clave: "gastosUnicos", etiqueta: "Pago único" },
  { clave: "servicioDeuda", etiqueta: "Servicio de deuda (préstamos + tarjetas)" },
  { clave: "pagosTarjetas", etiqueta: "Pagos a tarjetas (transferencias, no suman en gastos)" },
  { clave: "flujoNeto", etiqueta: "Flujo neto (ingresos − gastos)", grupo: "Resultado", fuerte: true },
  { clave: "ahorro", etiqueta: "Ahorro registrado (aportes − retiros)" },
  { clave: "sinFondo", etiqueta: "Dinero que no llegó a ningún fondo" },
  { clave: "tasaAhorro", etiqueta: "Tasa de ahorro", tipo: "pct", grupo: "Indicadores" },
  { clave: "pctGasto", etiqueta: "Gasto / ingreso", tipo: "pct" },
  { clave: "pctDeuda", etiqueta: "Deuda / ingreso", tipo: "pct" },
];

export default async function Reportes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await contexto();
  const { supabase, categorias, hogar } = ctx;
  const anio = Number(sp.anio) || hogar.anio_trabajo || new Date().getFullYear();

  const [{ ingresos, gastos, ahorros }, conceptos, montos, deudas] = await Promise.all([
    cargarAnio(ctx, anio),
    leerTodo<ConceptoPresupuesto>(supabase, "presupuesto_conceptos"),
    leerTodo<MontoPresupuesto>(supabase, "presupuesto_montos", (q) => q.eq("anio", anio)),
    cargarDeudas(ctx),
  ]);

  const r = resumenAnual(anio, ingresos, gastos, ahorros, categorias);
  const desv = desviaciones(anio, categorias, conceptos, montos, gastos);
  const activos = deudas.estadosPrestamos.filter((e) => e.prestamo.activo);
  const hoy = new Date();
  const cal = calendarioDeuda(activos, 24, `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`);
  const nombreP = new Map(activos.map((e) => [e.prestamo.id, `${e.prestamo.acreedor} – ${e.prestamo.descripcion}`]));
  const meta = num(hogar.meta_ahorro);
  const limite = num(hogar.limite_deuda);

  const celda = (f: FilaResumen, c: (typeof FILAS)[number]) => {
    const v = f[c.clave] as number | null;
    if (c.tipo === "pct") {
      const malo = (c.clave === "tasaAhorro" && v !== null && v < meta) || (c.clave === "pctDeuda" && v !== null && v > limite) || (c.clave === "pctGasto" && v !== null && v > 1);
      return <span className={malo ? "text-malo" : ""}>{porcentaje(v)}</span>;
    }
    return <span className={(v ?? 0) < 0 ? "text-malo" : ""}>{v ? numero(v) : "–"}</span>;
  };

  const tPlan = Array.from({ length: 12 }, (_, i) => desv.reduce((s, f) => s + f.planeado[i], 0));
  const tReal = Array.from({ length: 12 }, (_, i) => desv.reduce((s, f) => s + f.real[i], 0));

  return (
    <>
      <Encabezado titulo={`Reportes ${anio}`} subtitulo={`Meta de ahorro ${porcentaje(meta)} · límite de deuda ${porcentaje(limite)}`}>
        <Link href={`/reportes?anio=${anio - 1}`} className={claseBotonSec}>‹ {anio - 1}</Link>
        <Link href={`/reportes?anio=${anio + 1}`} className={claseBotonSec}>{anio + 1} ›</Link>
      </Encabezado>

      <Panel titulo="Resumen mensual e indicadores" className="mb-4">
        <div className="desplazable">
          <table className="tabla min-w-[1100px]">
            <thead>
              <tr><th>Indicador</th>{MESES_CORTOS.map((m) => <th key={m} className="num">{m}</th>)}<th className="num">Total</th><th className="num">Prom.</th></tr>
            </thead>
            <tbody>
              {FILAS.map((c) => [
                c.grupo && <tr key={`g-${c.grupo}`}><td colSpan={15} className="bg-fondo text-xs font-bold uppercase tracking-wide text-tenue">{c.grupo}</td></tr>,
                <tr key={c.clave} className={c.fuerte ? "font-semibold" : ""}>
                  <td>{c.etiqueta}</td>
                  {r.meses.map((f, i) => <td key={i} className="num">{celda(f, c)}</td>)}
                  <td className="num">{celda(r.total, c)}</td>
                  <td className="num">{celda(r.promedio, c)}</td>
                </tr>,
              ])}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-tenue">Promedio sobre {r.mesesConDatos} meses con movimientos.</p>
      </Panel>

      <Panel titulo="Desviaciones: planeado vs. real por categoría" className="mb-4">
        <div className="desplazable">
          <table className="tabla min-w-[1100px]">
            <thead>
              <tr><th>Categoría</th>{MESES_CORTOS.map((m) => <th key={m} className="num">{m}</th>)}<th className="num">Total</th></tr>
            </thead>
            <tbody>
              {desv.map((f) => (
                <tr key={f.categoriaId || "sin"}>
                  <td className="font-medium">{f.categoria}</td>
                  {f.planeado.map((p, i) => <Desv key={i} plan={p} real={f.real[i]} />)}
                  <Desv plan={f.totalPlaneado} real={f.totalReal} />
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Total</td>
                {tPlan.map((p, i) => <Desv key={i} plan={p} real={tReal[i]} />)}
                <Desv plan={tPlan.reduce((a, b) => a + b, 0)} real={tReal.reduce((a, b) => a + b, 0)} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-tenue">Cada celda: gasto real / planeado. Debajo, la desviación: positiva (naranja) = gastaste más de lo planeado.</p>
      </Panel>

      <Panel titulo="Calendario de deuda (próximos 24 meses)">
        {cal.length === 0 ? <p className="text-sm text-tenue">Sin cuotas pendientes.</p> : (
          <div className="desplazable">
            <table className="tabla">
              <thead><tr><th>Mes</th><th className="num">Pago total de préstamos</th><th>Se libera</th></tr></thead>
              <tbody>
                {cal.map((m) => {
                  const [a, mm] = partes(`${m.clave}-01`);
                  return (
                    <tr key={m.clave}>
                      <td className="whitespace-nowrap">{MESES_CORTOS[mm - 1]} {a}</td>
                      <td className="num font-semibold">{numero(m.total)}</td>
                      <td className="text-sm text-bueno">{m.terminan.map((id) => nombreP.get(id)).join(", ")}</td>
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

function Desv({ plan, real }: { plan: number; real: number }) {
  if (!plan && !real) return <td className="num text-tenue">–</td>;
  const d = real - plan;
  return (
    <td className="num">
      <div>{numero(real)}</div>
      <div className="text-xs text-tenue">/ {numero(plan)}</div>
      {plan > 0 && <div className={`text-xs ${d > 0 ? "text-malo" : "text-bueno"}`}>{d > 0 ? "+" : ""}{numero(d)}</div>}
    </td>
  );
}
