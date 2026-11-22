import { cache } from "react";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "./supabase/server";
import type { Categoria, Cuenta, Hogar, Persona } from "./tipos";

/** Sesión + hogar + catálogos. Se cachea por request. */
export const contexto = cache(async () => {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: miembro, error } = await supabase
    .from("miembros")
    .select("hogar_id, persona_id")
    .eq("user_id", user.id)
    .maybeSingle();
  // Un error aquí (p. ej. falta de permisos en la base) no debe confundirse
  // con "aún no tienes hogar": se muestra en la pantalla de bienvenida.
  if (error) redirect(`/hogar?error=${encodeURIComponent(mensajeBase(error.message))}`);
  if (!miembro) redirect("/hogar");

  const [hogar, personas, cuentas, categorias] = await Promise.all([
    supabase.from("hogares").select("*").eq("id", miembro.hogar_id).single(),
    supabase.from("personas").select("*").order("orden").order("nombre"),
    supabase.from("cuentas").select("*").order("nombre"),
    supabase.from("categorias").select("*").order("orden").order("nombre"),
  ]);

  return {
    supabase,
    user,
    hogarId: miembro.hogar_id as string,
    miPersonaId: miembro.persona_id as string | null,
    hogar: hogar.data as Hogar,
    personas: (personas.data ?? []) as Persona[],
    cuentas: (cuentas.data ?? []) as Cuenta[],
    categorias: (categorias.data ?? []) as Categoria[],
  };
});

/** Traduce errores de base de datos a un mensaje que diga qué hacer. */
export function mensajeBase(m: string): string {
  if (/permission denied|42501/i.test(m)) {
    return "La base de datos no da permisos a la app. En Supabase → SQL Editor ejecuta supabase/migrations/0002_permisos.sql y vuelve a intentar.";
  }
  if (/pagado_con_tarjeta_id/i.test(m)) {
    return "Falta actualizar la base de datos: en Supabase → SQL Editor ejecuta supabase/migrations/0003_pagado_con_tarjeta.sql.";
  }
  if (/does not exist|schema cache|PGRST205|42P01/i.test(m)) {
    return "Faltan tablas en la base de datos. Ejecuta supabase/migrations/0001_esquema.sql en Supabase → SQL Editor.";
  }
  return `Error de base de datos: ${m}`;
}

type Supa =Awaited<ReturnType<typeof crearClienteServidor>>;

/**
 * Lee todas las filas de una tabla (Supabase devuelve máx. 1000 por consulta).
 * `filtro` recibe el query builder para añadir .gte/.eq, etc.
 */
export async function leerTodo<T>(
  supabase: Supa,
  tabla: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filtro?: (q: any) => any,
  orden: { columna: string; asc?: boolean } = { columna: "id" },
): Promise<T[]> {
  const salida: T[] = [];
  const PAGINA = 1000;
  for (let desde = 0; ; desde += PAGINA) {
    let q = supabase.from(tabla).select("*");
    if (filtro) q = filtro(q);
    const { data, error } = await q
      .order(orden.columna, { ascending: orden.asc ?? true })
      .order("id")
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    salida.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) break;
  }
  return salida;
}

export function mapaNombres<T extends { id: string; nombre: string }>(lista: T[]) {
  return new Map(lista.map((x) => [x.id, x.nombre]));
}
