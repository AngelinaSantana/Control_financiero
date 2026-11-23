"use client";

import { useMemo, useState } from "react";
import { GraficaDeuda, type PuntoDeuda } from "@/components/GraficaDeuda";
import { MESES_CORTOS, partes, sumarMeses } from "@/lib/fechas";
import {
  NOMBRES_ESTRATEGIA, costoEfectivoAnual, costoMensual, diagnosticar, liberacionPorPeso, ordenRecomendado,
  pagoExigible, simular, simularActual, simularConsolidacion, sobregiro, type Deuda, type Estrategia, type ResultadoSimulacion,
} from "@/lib/finanzas/analisis";

interface Props {
  deudas: Deuda[];
  ingresoMensual: number;
  limiteDeuda: number;
  fondo: { saldo: number; meta: number };
  hoy: string; // YYYY-MM-DD
}

const rd = (n: number) => `RD$${new Intl.NumberFormat("es-DO", { maximumFractionDigits: 0 }).format(Math.round(n))}`;
const pct = (n: number | null) => (n === null || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(1)} %`);
const entrada = "w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm";
const tarjeta = "rounded-2xl border border-borde bg-superficie p-4 shadow-sm sm:p-5";
const ESTRATEGIAS: Estrategia[] = ["recomendada", "avalancha", "bola_nieve", "personalizada"];

export function AnalisisDeudas({ deudas, ingresoMensual, limiteDeuda, fondo, hoy }: Props) {
  const [extra, setExtra] = useState(5000);
  const [abono, setAbono] = useState(0);
  const [estrategia, setEstrategia] = useState<Estrategia>("recomendada");
  const [reinvertir, setReinvertir] = useState(true);
  const fondoIncompleto = fondo.meta > 0 && fondo.saldo < fondo.meta;
  const [reservarFondo, setReservarFondo] = useState(fondoIncompleto);
  const [ordenManual, setOrdenManual] = useState<string[]>(() => ordenRecomendado(deudas, 0).map((p) => p.id));
  const [selConsol, setSelConsol] = useState<string[]>(() => deudas.filter((d) => d.tipo === "tarjeta" && d.tasaAnual >= 0.4).map((d) => d.id));
  const [tasaConsol, setTasaConsol] = useState(24);
  const [plazoConsol, setPlazoConsol] = useState(36);

  const nombre = useMemo(() => new Map(deudas.map((d) => [d.id, d.nombre])), [deudas]);
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const etiquetaMes = (n: number) => { const [a, m] = partes(sumarMeses(inicioMes, n)); return `${MESES_CORTOS[m - 1]} ${a}`; };
  const duracion = (n: number | null) => {
    if (n === null) return "No termina";
    const a = Math.floor(n / 12), m = n % 12;
    return [a && `${a} año${a > 1 ? "s" : ""}`, m && `${m} mes${m > 1 ? "es" : ""}`].filter(Boolean).join(" y ") || "Este mes";
  };

  const dx = useMemo(() => diagnosticar(deudas, ingresoMensual, limiteDeuda), [deudas, ingresoMensual, limiteDeuda]);
  const prioridades = useMemo(() => ordenRecomendado(deudas, extra + abono), [deudas, extra, abono]);
  const actual = useMemo(() => simularActual(deudas), [deudas]);

  const opciones = (e: Estrategia) => ({
    estrategia: e, extraMensual: Math.max(extra, 0), abonoInicial: Math.max(abono, 0), reinvertirLiberado: reinvertir,
    fondo: reservarFondo && fondoIncompleto ? { saldo: fondo.saldo, meta: fondo.meta, porcentaje: 0.25 } : undefined,
    ordenManual,
  });
  const resultados = useMemo(() => {
    const r = {} as Record<Estrategia, ResultadoSimulacion>;
    for (const e of ESTRATEGIAS) r[e] = simular(deudas, opciones(e));
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deudas, extra, abono, reinvertir, reservarFondo, ordenManual]);
  const plan = resultados[estrategia];
  const mejor = ESTRATEGIAS.filter((e) => resultados[e].mesLibre !== null)
    .sort((a, b) => resultados[a].totalCostos - resultados[b].totalCostos)[0];

  const grafica = useMemo(() => {
    const total0 = deudas.reduce((s, d) => s + d.saldo, 0);
    const largo = Math.min(Math.max(actual.meses.length, plan.meses.length), 240);
    const paso = largo > 120 ? 3 : 1;
    const puntos: PuntoDeuda[] = [{ etiqueta: "Hoy", actual: total0, plan: total0 }];
    const marcas = new Set<number>([actual.meses.length, plan.meses.length].filter((n) => n > 0 && n <= largo));
    for (let i = paso; i <= largo; i += paso) marcas.add(i);
    for (const i of [...marcas].sort((a, b) => a - b)) {
      puntos.push({
        etiqueta: etiquetaMes(i),
        actual: i <= actual.meses.length ? actual.meses[i - 1].saldoTotal : null,
        plan: i <= plan.meses.length ? plan.meses[i - 1].saldoTotal : null,
      });
    }
    return puntos;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual, plan, deudas]);

  const consolidacion = useMemo(
    () => simularConsolidacion(deudas.filter((d) => selConsol.includes(d.id)), tasaConsol / 100, plazoConsol),
    [deudas, selConsol, tasaConsol, plazoConsol],
  );

  const mover = (id: string, delta: number) => setOrdenManual((o) => {
    const i = o.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= o.length) return o;
    const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  if (deudas.length === 0) {
    return <div className={tarjeta}><p className="text-sm text-tenue">No tienes préstamos ni tarjetas con saldo. ¡Felicidades!</p></div>;
  }

  const columnasPlan = deudas.filter((d) => plan.meses.slice(0, 12).some((m) => m.extraAplicado[d.id]));
  const ahorroMeses = actual.mesLibre !== null && plan.mesLibre !== null ? actual.mesLibre - plan.mesLibre : null;

  return (
    <div className="space-y-4">
      {/* ---------------- Diagnóstico ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Dato etiqueta="Deuda total" valor={rd(dx.deudaTotal)} />
        <Dato etiqueta="Te cuesta al mes" valor={rd(dx.costoMensual)} detalle={`intereses y seguros · ${pct(dx.pctCosto)} del ingreso`} malo={(dx.pctCosto ?? 0) > 0.15} />
        <Dato etiqueta="Pagos mínimos al mes" valor={rd(dx.pagosMinimos)} detalle={`${pct(dx.pctPagos)} del ingreso (límite ${Math.round(limiteDeuda * 100)} %)`} malo={(dx.pctPagos ?? 0) > limiteDeuda} />
        <Dato etiqueta="Uso de tarjetas" valor={pct(dx.utilizacionTarjetas)} detalle="sano: menos de 30 %" malo={(dx.utilizacionTarjetas ?? 0) > 0.3} />
        <Dato etiqueta="Libre de deudas al ritmo actual" valor={actual.mesLibre === null ? "No termina" : etiquetaMes(actual.mesLibre)} detalle={actual.mesLibre === null ? "algún pago no cubre los intereses" : duracion(actual.mesLibre)} malo={actual.mesLibre === null} />
      </div>
      <p className="text-xs text-tenue">Ingreso mensual de referencia: {rd(ingresoMensual)} (promedio de los últimos meses con ingresos registrados).</p>

      {dx.alertas.length > 0 && (
        <section className={tarjeta}>
          <h2 className="mb-2 text-base font-semibold">Lo que más urge</h2>
          <ul className="space-y-2 text-sm">
            {dx.alertas.map((a) => (
              <li key={a.texto} className="flex gap-2">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 text-xs font-bold ${a.nivel === "alto" ? "bg-malo/10 text-malo" : "bg-aviso/15 text-aviso"}`}>{a.nivel === "alto" ? "Alta" : "Media"}</span>
                <span>{a.texto}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------- Simulador: entradas ---------------- */}
      <section className={tarjeta}>
        <h2 className="mb-3 text-base font-semibold">Simulador: ¿a qué le abono?</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-tenue">Dinero extra al mes (RD$)</span>
            <input inputMode="decimal" value={extra || ""} placeholder="0" onChange={(e) => setExtra(Number(e.target.value.replace(/,/g, "")) || 0)} className={entrada} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-tenue">Abono único ahora (RD$)</span>
            <input inputMode="decimal" value={abono || ""} placeholder="0" onChange={(e) => setAbono(Number(e.target.value.replace(/,/g, "")) || 0)} className={entrada} />
          </label>
          <div className="flex flex-col gap-2 text-sm md:col-span-2">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={reinvertir} onChange={(e) => setReinvertir(e.target.checked)} className="mt-0.5 size-4 accent-marca" />
              <span>Cuando saldes una deuda, sumar su pago al abono de las demás <span className="text-tenue">(acelera mucho)</span></span>
            </label>
            {fondoIncompleto && (
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={reservarFondo} onChange={(e) => setReservarFondo(e.target.checked)} className="mt-0.5 size-4 accent-marca" />
                <span>Guardar el 25 % del extra en el fondo de emergencia hasta tener un colchón de {rd(fondo.meta)} (1 mes de gastos) <span className="text-tenue">· hoy tienes {rd(fondo.saldo)}. Evita volver a las tarjetas ante un imprevisto.</span></span>
              </label>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Estrategia">
          {ESTRATEGIAS.map((e) => (
            <button key={e} type="button" role="radio" aria-checked={estrategia === e} onClick={() => setEstrategia(e)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${estrategia === e ? "border-marca bg-marca text-white" : "border-borde text-texto hover:bg-fondo"}`}>
              {NOMBRES_ESTRATEGIA[e]}{mejor === e && extra + abono > 0 ? " ★" : ""}
            </button>
          ))}
        </div>
        {estrategia === "personalizada" && (
          <ol className="mt-3 space-y-1 text-sm">
            {ordenManual.map((id, i) => (
              <li key={id} className="flex items-center gap-2 rounded-lg bg-fondo px-3 py-1.5">
                <span className="w-5 text-tenue">{i + 1}.</span><span className="flex-1">{nombre.get(id)}</span>
                <button type="button" onClick={() => mover(id, -1)} disabled={i === 0} className="px-2 disabled:opacity-30" aria-label="Subir">↑</button>
                <button type="button" onClick={() => mover(id, 1)} disabled={i === ordenManual.length - 1} className="px-2 disabled:opacity-30" aria-label="Bajar">↓</button>
              </li>
            ))}
            <li className="text-xs text-tenue">Ordena las deudas: el dinero extra va a la primera hasta saldarla, luego a la siguiente.</li>
          </ol>
        )}
      </section>

      {/* ---------------- Resultado ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato etiqueta="Libre de deudas" valor={plan.mesLibre === null ? "No termina" : etiquetaMes(plan.mesLibre)} detalle={duracion(plan.mesLibre)} />
        <Dato etiqueta="Terminas antes" valor={ahorroMeses === null ? "—" : duracion(ahorroMeses)} detalle="que pagando solo los mínimos" bueno={!!ahorroMeses} />
        <Dato etiqueta="Ahorro en intereses y seguros" valor={rd(actual.mesLibre === null ? 0 : actual.totalCostos - plan.totalCostos)} detalle={actual.mesLibre === null ? "al ritmo actual la deuda no termina" : `pagarías ${rd(plan.totalCostos)} en vez de ${rd(actual.totalCostos)}`} bueno />
        <Dato etiqueta="Primera deuda que saldas" valor={(() => { const p = Object.entries(plan.saldadoEn).filter(([, m]) => m > 0).sort((a, b) => a[1] - b[1])[0]; return p ? nombre.get(p[0])! : "—"; })()}
          detalle={(() => { const p = Object.entries(plan.saldadoEn).filter(([, m]) => m > 0).sort((a, b) => a[1] - b[1])[0]; return p ? etiquetaMes(p[1]) : undefined; })()} />
      </div>

      <section className={tarjeta}>
        <h2 className="mb-2 text-base font-semibold">Deuda total en el tiempo</h2>
        <GraficaDeuda datos={grafica} nombrePlan={`Con el plan (${NOMBRES_ESTRATEGIA[estrategia]})`} />
      </section>

      <section className={tarjeta}>
        <h2 className="mb-2 text-base font-semibold">Comparación de estrategias</h2>
        <div className="desplazable">
          <table className="tabla">
            <thead><tr><th>Estrategia</th><th>Libre de deudas</th><th className="num">Intereses y seguros</th><th className="num">Total pagado</th></tr></thead>
            <tbody>
              <tr className="text-tenue"><td>Solo pagos mínimos</td><td>{actual.mesLibre === null ? "No termina" : `${etiquetaMes(actual.mesLibre)} (${duracion(actual.mesLibre)})`}</td><td className="num">{actual.mesLibre === null ? "—" : rd(actual.totalCostos)}</td><td className="num">{actual.mesLibre === null ? "—" : rd(actual.totalPagado)}</td></tr>
              {ESTRATEGIAS.map((e) => {
                const r = resultados[e];
                return (
                  <tr key={e} className={e === estrategia ? "font-semibold" : ""}>
                    <td>{NOMBRES_ESTRATEGIA[e]}{mejor === e ? <span className="ml-1 text-xs font-normal text-bueno">★ menos intereses</span> : null}</td>
                    <td>{r.mesLibre === null ? "No termina" : `${etiquetaMes(r.mesLibre)} (${duracion(r.mesLibre)})`}</td>
                    <td className="num">{rd(r.totalCostos)}</td>
                    <td className="num">{rd(r.totalPagado)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Prioridades ---------------- */}
      <section className={tarjeta}>
        <h2 className="mb-1 text-base font-semibold">Orden recomendado y por qué</h2>
        <p className="mb-3 text-xs text-tenue">Combina sobregiros, dinero mensual que liberas al saldar, costo real (tasa + seguros), penalidades y deudas sin interés.</p>
        <div className="desplazable">
          <table className="tabla min-w-[900px]">
            <thead><tr><th className="num">#</th><th>Deuda</th><th className="num">Saldo</th><th className="num">Tasa</th><th className="num">Costo real</th><th className="num">Te cuesta / mes</th><th className="num">Pago / mes</th><th>Se salda (plan)</th><th>Por qué</th></tr></thead>
            <tbody>
              {prioridades.map((p) => {
                const d = deudas.find((x) => x.id === p.id)!;
                const mes = plan.saldadoEn[d.id];
                return (
                  <tr key={p.id}>
                    <td className="num font-bold">{p.puesto}</td>
                    <td><div className="font-medium">{d.nombre}</div><div className="text-xs text-tenue">{d.tipo === "tarjeta" ? "Tarjeta" : "Préstamo"}{sobregiro(d) > 0 ? ` · sobregiro ${rd(sobregiro(d))}` : ""}</div></td>
                    <td className="num">{rd(d.saldo)}</td>
                    <td className="num">{pct(d.tasaAnual)}</td>
                    <td className="num">{pct(costoEfectivoAnual(d))}</td>
                    <td className="num">{rd(costoMensual(d))}</td>
                    <td className="num">{rd(pagoExigible(d))}<div className="text-xs text-tenue">libera {pct(liberacionPorPeso(d))} del saldo</div></td>
                    <td className="whitespace-nowrap">{mes ? etiquetaMes(mes) : "—"}</td>
                    <td className="text-sm">{p.motivo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Plan mes a mes ---------------- */}
      {extra + abono > 0 && (
        <section className={tarjeta}>
          <h2 className="mb-2 text-base font-semibold">Plan de los próximos 12 meses: a dónde va el dinero extra</h2>
          <div className="desplazable">
            <table className="tabla">
              <thead><tr><th>Mes</th>{columnasPlan.map((d) => <th key={d.id} className="num">{d.nombre}</th>)}{reservarFondo && fondoIncompleto && <th className="num">Fondo emergencia</th>}<th>Saldas</th><th className="num">Deuda restante</th></tr></thead>
              <tbody>
                {plan.meses.slice(0, 12).map((m) => (
                  <tr key={m.mes}>
                    <td className="whitespace-nowrap">{etiquetaMes(m.mes)}</td>
                    {columnasPlan.map((d) => <td key={d.id} className="num">{m.extraAplicado[d.id] ? rd(m.extraAplicado[d.id]) : ""}</td>)}
                    {reservarFondo && fondoIncompleto && <td className="num">{m.alFondo ? rd(m.alFondo) : ""}</td>}
                    <td className="text-sm text-bueno">{m.saldadas.map((id) => nombre.get(id)).join(", ")}</td>
                    <td className="num">{rd(m.saldoTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-tenue">Además del extra, se siguen pagando las cuotas y los pagos mínimos de todas las deudas.</p>
        </section>
      )}

      {/* ---------------- Consolidación ---------------- */}
      <section className={tarjeta}>
        <h2 className="mb-1 text-base font-semibold">¿Y si consolido tarjetas en un préstamo?</h2>
        <p className="mb-3 text-xs text-tenue">Compara pagar las tarjetas elegidas con la misma cuota mensual contra un préstamo nuevo a la tasa y plazo que te ofrezcan.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1 text-sm md:col-span-1">
            {deudas.filter((d) => d.tipo === "tarjeta").map((d) => (
              <label key={d.id} className="flex items-center gap-2">
                <input type="checkbox" checked={selConsol.includes(d.id)} onChange={(e) => setSelConsol((s) => e.target.checked ? [...s, d.id] : s.filter((x) => x !== d.id))} className="size-4 accent-marca" />
                <span>{d.nombre} <span className="text-tenue">· {rd(d.saldo)} al {Math.round(d.tasaAnual * 100)} %</span></span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 md:col-span-2">
            <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-tenue">Tasa del préstamo (%)</span>
              <input inputMode="decimal" value={tasaConsol} onChange={(e) => setTasaConsol(Number(e.target.value) || 0)} className={entrada} /></label>
            <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-tenue">Plazo (meses)</span>
              <input inputMode="numeric" value={plazoConsol} onChange={(e) => setPlazoConsol(Number(e.target.value) || 0)} className={entrada} /></label>
            {consolidacion ? (
              <div className="col-span-2 rounded-xl bg-fondo p-3 text-sm">
                Préstamo de <strong>{rd(consolidacion.monto)}</strong> con cuota de <strong>{rd(consolidacion.cuota)}</strong> al mes.{" "}
                Pagarías <strong>{rd(consolidacion.costoConsolidado)}</strong> de intereses en {plazoConsol} meses.{" "}
                {!consolidacion.tarjetasTerminan
                  ? <span className="font-semibold text-bueno">Pagando esa misma cuota a las tarjetas nunca terminarías: sus intereses son mayores que la cuota. Consolidar sí te permite salir.</span>
                  : <>Pagando esa misma cuota a las tarjetas pagarías <strong>{rd(consolidacion.costoActual)}</strong>.{" "}</>}
                {!consolidacion.tarjetasTerminan ? null : consolidacion.ahorro > 0
                  ? <span className="font-semibold text-bueno">Te ahorrarías {rd(consolidacion.ahorro)}.</span>
                  : <span className="font-semibold text-malo">No conviene: pagarías {rd(-consolidacion.ahorro)} más.</span>}
                <span className="mt-1 block text-xs text-tenue">Antes de decidir, pregunta por comisiones de apertura y seguros del préstamo, y evita volver a usar las tarjetas saldadas.</span>
              </div>
            ) : <p className="col-span-2 text-sm text-tenue">Elige al menos una tarjeta.</p>}
          </div>
        </div>
      </section>

      <p className="text-xs text-tenue">
        Son cálculos con tus datos, no asesoría financiera profesional. Usan interés mensual (tasa ÷ 12), que se aproxima al cálculo por días de los bancos.
        Antes de saldar o consolidar, confirma con el banco el saldo exacto y si cobra penalidad por pago anticipado (puedes anotarla en cada préstamo).
      </p>
    </div>
  );
}

function Dato({ etiqueta, valor, detalle, malo, bueno }: { etiqueta: string; valor: string; detalle?: string; malo?: boolean; bueno?: boolean }) {
  return (
    <div className="rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-tenue">{etiqueta}</div>
      <div className={`mt-1 break-words text-lg font-bold tabular-nums sm:text-xl ${malo ? "text-malo" : bueno ? "text-bueno" : ""}`}>{valor}</div>
      {detalle && <div className="mt-1 text-xs text-tenue">{detalle}</div>}
    </div>
  );
}
