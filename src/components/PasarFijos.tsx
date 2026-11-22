import { copiarFijos } from "@/app/acciones";
import { Insignia, claseBoton } from "@/components/ui";
import { formatoFecha, sumarMeses } from "@/lib/fechas";
import { num, type Gasto, type Ingreso } from "@/lib/tipos";

/**
 * Lista los movimientos "Fijo" del mes para copiarlos al mes siguiente.
 * Los que ya existen allí (mismo concepto y responsable) vienen desmarcados.
 */
export function PasarFijos({ tabla, fijos, existentes, nombreMesSig, volver, nombrePersona }: {
  tabla: "ingresos" | "gastos";
  fijos: (Gasto | Ingreso)[];
  existentes: (Gasto | Ingreso)[];
  nombreMesSig: string;
  volver: string;
  nombrePersona: (id: string | null) => string;
}) {
  const clave = (m: Gasto | Ingreso) => `${m.concepto.trim().toLowerCase()}|${m.persona_id ?? ""}`;
  const yaEstan = new Set(existentes.map(clave));
  const pendientes = fijos.filter((m) => !yaEstan.has(clave(m))).length;

  return (
    <details className="mb-4 rounded-2xl border border-borde bg-superficie p-4 shadow-sm sm:p-5">
      <summary className="cursor-pointer text-base font-semibold">
        Pasar {tabla === "ingresos" ? "ingresos" : "gastos"} fijos a {nombreMesSig}
        <span className="ml-2 text-sm font-normal text-tenue">
          {pendientes > 0 ? `${pendientes} por copiar` : "todos copiados"}
        </span>
      </summary>
      <form action={copiarFijos} className="mt-4">
        <input type="hidden" name="tabla" value={tabla} />
        <input type="hidden" name="volver" value={volver} />
        <p className="mb-3 text-sm text-tenue">
          Marca los que se repiten y ajusta el monto si cambió. Se crean con el mismo día en {nombreMesSig}.
        </p>
        <ul className="divide-y divide-borde">
          {fijos.map((m) => {
            const repetido = yaEstan.has(clave(m));
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <input type="checkbox" name="ids" value={m.id} defaultChecked={!repetido} className="size-4 accent-marca" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.concepto}</span>
                    <span className="block text-xs text-tenue">
                      {nombrePersona(m.persona_id)} · {formatoFecha(m.fecha)} → {formatoFecha(sumarMeses(m.fecha, 1))}
                    </span>
                  </span>
                </label>
                {repetido && <Insignia tono="normal">Ya está en {nombreMesSig}</Insignia>}
                <input
                  name={`monto_${m.id}`}
                  defaultValue={num(m.monto).toFixed(2)}
                  inputMode="decimal"
                  aria-label={`Monto de ${m.concepto}`}
                  className="w-32 rounded-lg border border-borde bg-superficie px-2 py-1 text-right tabular-nums"
                />
              </li>
            );
          })}
        </ul>
        <button className={`${claseBoton} mt-3`}>Copiar marcados a {nombreMesSig}</button>
      </form>
    </details>
  );
}
