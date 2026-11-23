-- =====================================================================
-- Reglas aprendidas al importar estados de cuenta.
-- Cuando corriges una fila ("PEDIDOS YA" → Alimentación), la app recuerda
-- la acción y la categoría para ese comercio y las propone la próxima vez.
-- Se puede ejecutar varias veces sin problema.
-- =====================================================================
create table if not exists public.reglas_importacion (
  id           uuid primary key default gen_random_uuid(),
  hogar_id     uuid not null references public.hogares(id) on delete cascade,
  patron       text not null,              -- comercio normalizado, p. ej. "SUPERMERCADO NACIONAL"
  accion       text not null,
  categoria_id uuid references public.categorias(id) on delete set null,
  tarjeta_id   uuid references public.tarjetas(id) on delete set null,
  prestamo_id  uuid references public.prestamos(id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (hogar_id, patron)
);

alter table public.reglas_importacion enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'reglas_importacion' and policyname = 'reglas_importacion_hogar') then
    create policy reglas_importacion_hogar on public.reglas_importacion
      for all using (public.es_miembro(hogar_id)) with check (public.es_miembro(hogar_id));
  end if;
end $$;

grant select, insert, update, delete on public.reglas_importacion to authenticated;
