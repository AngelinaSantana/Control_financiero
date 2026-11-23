import { Importador } from "@/components/Importador";
import { Encabezado, Panel } from "@/components/ui";
import { contexto, leerTodo } from "@/lib/datos";
import type { Prestamo, Tarjeta } from "@/lib/tipos";

// Leer un estado con Claude puede tardar; Vercel corta por defecto antes.
export const maxDuration = 120;

export default async function Importar() {
  const { supabase, cuentas, categorias, personas } = await contexto();
  const [tarjetas, prestamos] = await Promise.all([
    leerTodo<Tarjeta>(supabase, "tarjetas", (q) => q.eq("activa", true), { columna: "nombre" }),
    leerTodo<Prestamo>(supabase, "prestamos", (q) => q.eq("activo", true), { columna: "acreedor" }),
  ]);
  const configurado = !!process.env.ANTHROPIC_API_KEY;

  return (
    <>
      <Encabezado
        titulo="Importar estado de cuenta"
        subtitulo="Sube el PDF de tu banco: Claude lee los movimientos, tú los revisas y la app los registra"
      />
      {!configurado ? (
        <Panel titulo="Falta conectar Claude">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Entra a <strong>platform.claude.com</strong>, crea una cuenta y agrega saldo en <strong>Billing</strong>.</li>
            <li>En <strong>API Keys</strong> crea una clave nueva y cópiala.</li>
            <li>En Vercel → tu proyecto → <strong>Settings → Environment Variables</strong>, agrega <code>ANTHROPIC_API_KEY</code> con esa clave.</li>
            <li>En <strong>Deployments</strong>, pulsa los tres puntos del último despliegue → <strong>Redeploy</strong>.</li>
          </ol>
        </Panel>
      ) : (
        <Importador
          tarjetas={tarjetas.map((t) => ({ id: t.id, nombre: t.nombre, moneda: t.moneda }))}
          cuentas={cuentas.filter((c) => c.activa).map((c) => ({ id: c.id, nombre: c.nombre }))}
          categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo }))}
          prestamos={prestamos.map((p) => ({ id: p.id, nombre: `${p.acreedor} – ${p.descripcion}` }))}
          personas={personas.map((p) => ({ id: p.id, nombre: p.nombre }))}
        />
      )}
    </>
  );
}
