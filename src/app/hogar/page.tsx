import { redirect } from "next/navigation";
import { cerrarSesion, crearHogar, unirseHogar } from "@/app/acciones";
import { Campo, Mensajes, claseBoton, claseBotonSec, claseInput } from "@/components/ui";
import { crearClienteServidor } from "@/lib/supabase/server";

export default async function Hogar({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: miembro } = await supabase.from("miembros").select("hogar_id").eq("user_id", user.id).maybeSingle();
  if (miembro) redirect("/");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold">Bienvenida/o</h1>
      <p className="mb-6 text-sm text-tenue">
        Cada uno entra con su propia cuenta y ambos ven el mismo presupuesto. Una persona crea el hogar y la otra se une con el código de invitación.
      </p>
      <Mensajes error={sp.error} />
      <div className="grid gap-4 md:grid-cols-2">
        <form action={crearHogar} className="flex flex-col gap-3 rounded-2xl border border-borde bg-superficie p-5 shadow-sm">
          <h2 className="font-semibold">Crear un hogar nuevo</h2>
          <Campo etiqueta="Nombre del hogar">
            <input name="nombre" required placeholder="Familia Santana" className={claseInput} />
          </Campo>
          <Campo etiqueta="¿Cómo te llamamos?">
            <input name="mi_nombre" required placeholder="Wife" className={claseInput} />
          </Campo>
          <button className={claseBoton}>Crear hogar</button>
        </form>
        <form action={unirseHogar} className="flex flex-col gap-3 rounded-2xl border border-borde bg-superficie p-5 shadow-sm">
          <h2 className="font-semibold">Unirme a un hogar</h2>
          <Campo etiqueta="Código de invitación">
            <input name="codigo" required placeholder="AB12CD34" className={`${claseInput} uppercase`} />
          </Campo>
          <Campo etiqueta="¿Cómo te llamamos? (usa el mismo nombre que en los datos importados)">
            <input name="mi_nombre" required placeholder="Husband" className={claseInput} />
          </Campo>
          <button className={claseBoton}>Unirme</button>
        </form>
      </div>
      <form action={cerrarSesion} className="mt-6">
        <button className={claseBotonSec}>Salir</button>
      </form>
    </div>
  );
}
