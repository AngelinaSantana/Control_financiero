import Link from "next/link";
import { iniciarSesion, registrarse } from "@/app/acciones";
import { Campo, Mensajes, claseBoton, claseInput } from "@/components/ui";

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const registro = sp.modo === "registro";
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-bold">Control Financiero Familiar</h1>
      <p className="mb-6 text-sm text-tenue">{registro ? "Crea tu cuenta" : "Entra con tu cuenta"}</p>
      <Mensajes error={sp.error} ok={sp.ok} />
      <form action={registro ? registrarse : iniciarSesion} className="flex flex-col gap-4 rounded-2xl border border-borde bg-superficie p-5 shadow-sm">
        <Campo etiqueta="Correo">
          <input name="email" type="email" required autoComplete="email" className={claseInput} />
        </Campo>
        <Campo etiqueta="Contraseña">
          <input name="password" type="password" required minLength={6} autoComplete={registro ? "new-password" : "current-password"} className={claseInput} />
        </Campo>
        <button className={claseBoton}>{registro ? "Crear cuenta" : "Entrar"}</button>
      </form>
      <p className="mt-4 text-center text-sm text-tenue">
        {registro ? (
          <>¿Ya tienes cuenta? <Link href="/login" className="font-semibold text-marca">Entrar</Link></>
        ) : (
          <>¿Primera vez? <Link href="/login?modo=registro" className="font-semibold text-marca">Crear cuenta</Link></>
        )}
      </p>
    </div>
  );
}
