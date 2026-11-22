-- =====================================================================
-- Permisos de la API (Data API / PostgREST) para usuarios con sesión.
-- Algunos proyectos nuevos de Supabase no los conceden automáticamente
-- a las tablas creadas desde el SQL Editor. La seguridad real la siguen
-- dando las políticas RLS: cada usuario sólo ve las filas de su hogar.
-- Se puede ejecutar varias veces sin problema.
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.es_miembro(uuid) to authenticated;
grant execute on function public.crear_hogar(text, text) to authenticated;
grant execute on function public.unirse_hogar(text, text) to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
