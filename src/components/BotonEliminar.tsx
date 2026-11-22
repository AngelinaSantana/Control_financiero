"use client";

import { eliminar } from "@/app/acciones";

export function BotonEliminar({ tabla, id, volver, texto = "Eliminar" }: { tabla: string; id: string; volver: string; texto?: string }) {
  return (
    <form
      action={eliminar}
      onSubmit={(e) => {
        if (!confirm("¿Seguro que quieres eliminarlo? No se puede deshacer.")) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="tabla" value={tabla} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="volver" value={volver} />
      <button type="submit" className="text-xs font-medium text-malo hover:underline">{texto}</button>
    </form>
  );
}
