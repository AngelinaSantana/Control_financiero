import { guardarPrestamo } from "@/app/acciones";
import { Campo, Seleccion, claseBoton, claseInput } from "@/components/ui";
import { num, type Persona, type Prestamo } from "@/lib/tipos";

export function FormPrestamo({ volver, personas, p }: { volver: string; personas: Persona[]; p?: Prestamo }) {
  const v = (n: unknown) => (n === null || n === undefined || n === "" ? "" : String(n));
  return (
    <form action={guardarPrestamo} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <input type="hidden" name="volver" value={volver} />
      {p && <input type="hidden" name="id" value={p.id} />}
      <Campo etiqueta="Acreedor / banco">
        <input name="acreedor" required defaultValue={p?.acreedor} className={claseInput} />
      </Campo>
      <Campo etiqueta="Descripción">
        <input name="descripcion" defaultValue={p?.descripcion} className={claseInput} />
      </Campo>
      <Campo etiqueta="Responsable">
        <Seleccion name="persona_id" vacio="—" valor={p?.persona_id} opciones={personas.map((x) => ({ valor: x.id, etiqueta: x.nombre }))} />
      </Campo>
      <Campo etiqueta="Monto original (RD$)">
        <input name="monto_original" required inputMode="decimal" defaultValue={v(p?.monto_original)} className={claseInput} />
      </Campo>
      <Campo etiqueta="Fecha de inicio (desembolso)">
        <input type="date" name="fecha_inicio" required defaultValue={p?.fecha_inicio} className={claseInput} />
      </Campo>
      <Campo etiqueta="Fecha de la 1ª cuota">
        <input type="date" name="fecha_primera_cuota" required defaultValue={p?.fecha_primera_cuota} className={claseInput} />
      </Campo>
      <Campo etiqueta="Tasa anual (%)">
        <input name="tasa_anual" inputMode="decimal" defaultValue={p ? +(num(p.tasa_anual) * 100).toFixed(4) : ""} className={claseInput} />
      </Campo>
      <Campo etiqueta="Base de días">
        <Seleccion name="base_dias" valor={String(p?.base_dias ?? 360)} opciones={[{ valor: "360", etiqueta: "360" }, { valor: "365", etiqueta: "365" }]} />
      </Campo>
      <Campo etiqueta="Cuotas totales">
        <input name="cuotas_totales" required inputMode="numeric" defaultValue={v(p?.cuotas_totales)} className={claseInput} />
      </Campo>
      <Campo etiqueta="Cuota mensual TOTAL (con seguro)">
        <input name="cuota_total" required inputMode="decimal" defaultValue={v(p?.cuota_total)} className={claseInput} />
      </Campo>
      <Campo etiqueta="Seguro / cargos por cuota">
        <input name="seguro_cuota" inputMode="decimal" defaultValue={v(p?.seguro_cuota)} className={claseInput} />
      </Campo>
      <div className="col-span-2 rounded-xl bg-fondo p-3 text-xs text-tenue md:col-span-4">
        <strong className="text-texto">Foto de referencia (opcional, recomendado):</strong> copia de la tabla del banco el saldo de capital después de la última cuota pagada.
        Desde ahí la app proyecta. Las cuotas que registres después como gasto enlazado bajan el saldo solas.
      </div>
      <Campo etiqueta="Saldo de capital en la foto">
        <input name="saldo_referencia" inputMode="decimal" defaultValue={v(p?.saldo_referencia)} className={claseInput} />
      </Campo>
      <Campo etiqueta="Cuotas pagadas a esa fecha">
        <input name="cuotas_pagadas_referencia" inputMode="numeric" defaultValue={v(p?.cuotas_pagadas_referencia)} className={claseInput} />
      </Campo>
      <Campo etiqueta="Fecha de la foto">
        <input type="date" name="fecha_referencia" defaultValue={p?.fecha_referencia ?? ""} className={claseInput} />
      </Campo>
      <Campo etiqueta="Penalidad por pago anticipado (%)">
        <input name="penalidad_pago_anticipado" inputMode="decimal" placeholder="0"
          defaultValue={p && num(p.penalidad_pago_anticipado) ? +(num(p.penalidad_pago_anticipado) * 100).toFixed(2) : ""} className={claseInput} />
      </Campo>
      {p && num(p.penalidad_pago_anticipado) > 0 && <input type="hidden" name="tenia_penalidad" value="1" />}
      <Campo etiqueta="Estado">
        <Seleccion name="activo" valor={p && !p.activo ? "off" : "on"} opciones={[{ valor: "on", etiqueta: "Activo" }, { valor: "off", etiqueta: "Saldado / archivado" }]} />
      </Campo>
      <div className="col-span-2 md:col-span-4">
        <button className={claseBoton}>{p ? "Guardar cambios" : "Agregar préstamo"}</button>
      </div>
    </form>
  );
}
