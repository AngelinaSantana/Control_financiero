import { guardarMovimiento } from "@/app/acciones";
import { Campo, Seleccion, claseBoton, claseInput } from "@/components/ui";
import { hoyISO } from "@/lib/fechas";
import { QUINCENAS, TIPOS_MOV, num, type Categoria, type Cuenta, type Gasto, type Ingreso, type Persona } from "@/lib/tipos";

interface Props {
  tabla: "ingresos" | "gastos";
  volver: string;
  personas: Persona[];
  cuentas: Cuenta[];
  categorias: Categoria[];
  prestamos?: { id: string; nombre: string }[];
  tarjetas?: { id: string; nombre: string }[];
  editar?: Gasto | Ingreso | null;
  miPersonaId?: string | null;
}

export function FormMovimiento({ tabla, volver, personas, cuentas, categorias, prestamos = [], tarjetas = [], editar, miPersonaId }: Props) {
  const esGasto = tabla === "gastos";
  const g = editar as Gasto | null | undefined;
  const hoy = hoyISO();
  const quincenaHoy = Number(hoy.slice(8, 10)) <= 15 ? "Q1" : "Q2";
  return (
    <form action={guardarMovimiento} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <input type="hidden" name="tabla" value={tabla} />
      <input type="hidden" name="volver" value={volver} />
      {editar && <input type="hidden" name="id" value={editar.id} />}
      <Campo etiqueta="Fecha">
        <input type="date" name="fecha" required defaultValue={editar?.fecha ?? hoy} className={claseInput} />
      </Campo>
      <Campo etiqueta="Monto (RD$)">
        <input name="monto" required inputMode="decimal" defaultValue={editar ? num(editar.monto) : ""} placeholder="0.00" className={claseInput} />
      </Campo>
      <Campo etiqueta="Concepto" className="col-span-2">
        <input name="concepto" required defaultValue={editar?.concepto ?? ""} placeholder={esGasto ? "Supermercado, combustible…" : "Salario quincena 1…"} className={claseInput} />
      </Campo>
      <Campo etiqueta="Categoría">
        <Seleccion
          name="categoria_id"
          vacio="—"
          valor={editar?.categoria_id}
          opciones={categorias.filter((c) => c.tipo === (esGasto ? "gasto" : "ingreso")).map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
        />
      </Campo>
      <Campo etiqueta="Responsable">
        <Seleccion name="persona_id" vacio="—" valor={editar ? editar.persona_id : miPersonaId} opciones={personas.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} />
      </Campo>
      <Campo etiqueta="Cuenta">
        <Seleccion name="cuenta_id" vacio="—" valor={editar?.cuenta_id} opciones={cuentas.filter((c) => c.activa).map((c) => ({ valor: c.id, etiqueta: c.nombre }))} />
      </Campo>
      <Campo etiqueta="Tipo">
        <Seleccion name="tipo" valor={editar?.tipo ?? (esGasto ? "Variable" : "Fijo")} opciones={TIPOS_MOV.map((t) => ({ valor: t, etiqueta: t }))} />
      </Campo>
      <Campo etiqueta="Quincena">
        <Seleccion name="quincena" valor={editar?.quincena ?? quincenaHoy} opciones={QUINCENAS.map((q) => ({ valor: q.valor, etiqueta: q.etiqueta }))} />
      </Campo>
      {esGasto && (
        <>
          <Campo etiqueta="Pagado con">
            <Seleccion
              name="pagado_con_tarjeta_id"
              vacio="Efectivo / cuenta bancaria"
              valor={g?.pagado_con_tarjeta_id}
              opciones={tarjetas.map((t) => ({ valor: t.id, etiqueta: `Tarjeta: ${t.nombre}` }))}
            />
          </Campo>
          {g?.pagado_con_tarjeta_id && <input type="hidden" name="tenia_pagado_con" value="1" />}
          <Campo etiqueta="¿Es cuota de un préstamo?">
            <Seleccion name="prestamo_id" vacio="No" valor={g?.prestamo_id} opciones={prestamos.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} />
          </Campo>
          <Campo etiqueta="¿Es un pago A una tarjeta?">
            <Seleccion name="tarjeta_id" vacio="No" valor={g?.tarjeta_id} opciones={tarjetas.map((t) => ({ valor: t.id, etiqueta: t.nombre }))} />
          </Campo>
          <p className="col-span-2 self-end text-xs text-tenue md:col-span-1">
            <strong>Pagado con tarjeta</strong>: la compra cuenta como gasto y sube la deuda de la tarjeta.{" "}
            <strong>Pago a una tarjeta</strong>: baja la deuda y no se suma otra vez como gasto.
          </p>
        </>
      )}
      <Campo etiqueta="Notas" className="col-span-2">
        <input name="notas" defaultValue={editar?.notas ?? ""} className={claseInput} />
      </Campo>
      <div className="col-span-2 flex items-end md:col-span-4">
        <button className={claseBoton}>{editar ? "Guardar cambios" : esGasto ? "Registrar gasto" : "Registrar ingreso"}</button>
      </div>
    </form>
  );
}
