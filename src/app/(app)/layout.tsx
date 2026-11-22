import { cerrarSesion } from "@/app/acciones";
import { Navegacion } from "@/components/Navegacion";
import { contexto } from "@/lib/datos";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const { hogar, user, personas, miPersonaId } = await contexto();
  const yo = personas.find((p) => p.id === miPersonaId)?.nombre ?? user.email;
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 mb-6 border-b border-borde bg-fondo/95 px-4 pt-3 pb-2 backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="font-bold">{hogar.nombre}</div>
          <div className="flex items-center gap-3 text-sm text-tenue">
            <span className="hidden sm:inline">{yo}</span>
            <form action={cerrarSesion}>
              <button className="hover:text-texto hover:underline">Salir</button>
            </form>
          </div>
        </div>
        <Navegacion />
      </header>
      <main>{children}</main>
    </div>
  );
}
