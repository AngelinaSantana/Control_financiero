-- =====================================================================
-- Control Financiero Familiar — esquema inicial
-- Ejecutar en Supabase: SQL Editor → pegar todo → Run.
-- Todas las tablas pertenecen a un "hogar". Cada usuario (auth.users)
-- es miembro de un hogar y ve TODO lo de su hogar (RLS).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Hogar, miembros y catálogos
-- ---------------------------------------------------------------------
create table public.hogares (
  id                     uuid primary key default gen_random_uuid(),
  nombre                 text not null,
  codigo_invitacion      text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  anio_trabajo           int  not null default extract(year from now())::int,
  meta_ahorro            numeric(6,4) not null default 0.20,  -- 20 % del ingreso
  limite_deuda           numeric(6,4) not null default 0.30,  -- cuotas / ingreso
  meses_fondo_emergencia numeric(5,2) not null default 3,
  tasa_cambio_usd        numeric(12,4) not null default 60,   -- RD$ por US$
  created_at             timestamptz not null default now()
);

create table public.miembros (
  hogar_id   uuid not null references public.hogares(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  persona_id uuid,
  created_at timestamptz not null default now(),
  primary key (hogar_id, user_id),
  unique (user_id)                      -- un usuario pertenece a un solo hogar
);

-- Responsables de los movimientos (Wife, Husband, Ambos…)
create table public.personas (
  id            uuid primary key default gen_random_uuid(),
  hogar_id      uuid not null references public.hogares(id) on delete cascade,
  nombre        text not null,
  es_compartido boolean not null default false,  -- "Ambos" / "Couple"
  orden         int not null default 0,
  unique (hogar_id, nombre)
);

alter table public.miembros
  add constraint miembros_persona_fk foreign key (persona_id)
  references public.personas(id) on delete set null;

create table public.cuentas (
  id       uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  nombre   text not null,
  activa   boolean not null default true,
  unique (hogar_id, nombre)
);

create table public.categorias (
  id       uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  nombre   text not null,
  tipo     text not null check (tipo in ('gasto', 'ingreso')),
  orden    int not null default 0,
  unique (hogar_id, tipo, nombre)
);

-- Valores permitidos (equivalen a las listas de la hoja Config)
-- tipo:     'Fijo' | 'Variable' | 'Pago único'
-- quincena: 'Q1' (día 15) | 'Q2' (día 30) | 'Ambas' | 'N/A'

-- ---------------------------------------------------------------------
-- Préstamos bancarios
-- ---------------------------------------------------------------------
create table public.prestamos (
  id                        uuid primary key default gen_random_uuid(),
  hogar_id                  uuid not null references public.hogares(id) on delete cascade,
  acreedor                  text not null,
  descripcion               text not null default '',
  persona_id                uuid references public.personas(id) on delete set null,
  fecha_inicio              date not null,
  fecha_primera_cuota       date not null,
  monto_original            numeric(14,2) not null check (monto_original >= 0),
  tasa_anual                numeric(8,6) not null default 0 check (tasa_anual >= 0),
  base_dias                 int not null default 360 check (base_dias in (360, 365)),
  cuotas_totales            int not null check (cuotas_totales > 0),
  cuota_total               numeric(14,2) not null check (cuota_total >= 0),  -- incluye seguro
  seguro_cuota              numeric(14,2) not null default 0,
  -- Foto conocida del préstamo (de la tabla del banco). Desde aquí se proyecta.
  saldo_referencia          numeric(14,2),
  cuotas_pagadas_referencia int not null default 0,
  fecha_referencia          date,
  penalidad_pago_anticipado numeric(6,4) not null default 0,  -- 0.03 = 3 % por abonar antes
  activo                    boolean not null default true,
  created_at                timestamptz not null default now()
);

-- Abonos extraordinarios a capital
create table public.prestamo_abonos (
  id          uuid primary key default gen_random_uuid(),
  hogar_id    uuid not null references public.hogares(id) on delete cascade,
  prestamo_id uuid not null references public.prestamos(id) on delete cascade,
  fecha       date not null,
  monto       numeric(14,2) not null check (monto > 0),
  notas       text
);

-- ---------------------------------------------------------------------
-- Tarjetas de crédito
-- ---------------------------------------------------------------------
create table public.tarjetas (
  id               uuid primary key default gen_random_uuid(),
  hogar_id         uuid not null references public.hogares(id) on delete cascade,
  nombre           text not null,
  persona_id       uuid references public.personas(id) on delete set null,
  moneda           text not null default 'DOP' check (moneda in ('DOP', 'USD')),
  limite           numeric(14,2) not null default 0,     -- en la moneda de la tarjeta
  tasa_anual       numeric(8,6) not null default 0.60,
  dia_corte        int check (dia_corte between 1 and 31),
  dia_pago         int check (dia_pago between 1 and 31),
  pago_minimo      numeric(14,2),
  pago_programado  numeric(14,2),
  saldo_referencia numeric(14,2) not null default 0,     -- saldo conocido en fecha_referencia
  fecha_referencia date not null default current_date,
  activa           boolean not null default true,
  created_at       timestamptz not null default now()
);

create table public.tarjeta_movimientos (
  id          uuid primary key default gen_random_uuid(),
  hogar_id    uuid not null references public.hogares(id) on delete cascade,
  tarjeta_id  uuid not null references public.tarjetas(id) on delete cascade,
  fecha       date not null,
  tipo        text not null check (tipo in ('consumo', 'pago', 'cargo')),
  monto       numeric(14,2) not null check (monto > 0),  -- en la moneda de la tarjeta
  descripcion text
);

-- ---------------------------------------------------------------------
-- Presupuesto planeado
-- ---------------------------------------------------------------------
create table public.presupuesto_conceptos (
  id           uuid primary key default gen_random_uuid(),
  hogar_id     uuid not null references public.hogares(id) on delete cascade,
  categoria_id uuid not null references public.categorias(id) on delete restrict,
  concepto     text not null,
  tipo         text not null default 'Fijo' check (tipo in ('Fijo', 'Variable', 'Pago único')),
  persona_id   uuid references public.personas(id) on delete set null,
  quincena     text not null default 'N/A' check (quincena in ('Q1', 'Q2', 'Ambas', 'N/A')),
  cuenta_id    uuid references public.cuentas(id) on delete set null,
  activo       boolean not null default true,
  orden        int not null default 0
);

create table public.presupuesto_montos (
  id          uuid not null unique default gen_random_uuid(),
  hogar_id    uuid not null references public.hogares(id) on delete cascade,
  concepto_id uuid not null references public.presupuesto_conceptos(id) on delete cascade,
  anio        int not null,
  mes         int not null check (mes between 1 and 12),
  monto       numeric(14,2) not null default 0,
  primary key (concepto_id, anio, mes)
);

-- ---------------------------------------------------------------------
-- Movimientos reales
-- ---------------------------------------------------------------------
create table public.ingresos (
  id           uuid primary key default gen_random_uuid(),
  hogar_id     uuid not null references public.hogares(id) on delete cascade,
  fecha        date not null,
  persona_id   uuid references public.personas(id) on delete set null,
  concepto     text not null,
  categoria_id uuid references public.categorias(id) on delete set null,
  tipo         text not null default 'Fijo' check (tipo in ('Fijo', 'Variable', 'Pago único')),
  cuenta_id    uuid references public.cuentas(id) on delete set null,
  quincena     text not null default 'N/A' check (quincena in ('Q1', 'Q2', 'Ambas', 'N/A')),
  monto        numeric(14,2) not null check (monto >= 0),
  notas        text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

create table public.gastos (
  id           uuid primary key default gen_random_uuid(),
  hogar_id     uuid not null references public.hogares(id) on delete cascade,
  fecha        date not null,
  persona_id   uuid references public.personas(id) on delete set null,
  concepto     text not null,
  categoria_id uuid references public.categorias(id) on delete set null,
  tipo         text not null default 'Variable' check (tipo in ('Fijo', 'Variable', 'Pago único')),
  cuenta_id    uuid references public.cuentas(id) on delete set null,
  quincena     text not null default 'N/A' check (quincena in ('Q1', 'Q2', 'Ambas', 'N/A')),
  monto        numeric(14,2) not null check (monto >= 0),
  notas        text,
  -- Si el gasto es la cuota de un préstamo o el pago de una tarjeta,
  -- se enlaza para que el saldo baje solo (sin doble registro).
  prestamo_id  uuid references public.prestamos(id) on delete set null,
  tarjeta_id   uuid references public.tarjetas(id) on delete set null,
  -- Compra hecha con esta tarjeta (consumo): es gasto y sube el saldo de la tarjeta.
  pagado_con_tarjeta_id uuid references public.tarjetas(id) on delete set null,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Ahorros
-- ---------------------------------------------------------------------
create table public.fondos_ahorro (
  id         uuid primary key default gen_random_uuid(),
  hogar_id   uuid not null references public.hogares(id) on delete cascade,
  nombre     text not null,
  meta       numeric(14,2),
  persona_id uuid references public.personas(id) on delete set null,
  orden      int not null default 0,
  unique (hogar_id, nombre)
);

create table public.ahorro_movimientos (
  id         uuid primary key default gen_random_uuid(),
  hogar_id   uuid not null references public.hogares(id) on delete cascade,
  fondo_id   uuid not null references public.fondos_ahorro(id) on delete cascade,
  fecha      date not null,
  persona_id uuid references public.personas(id) on delete set null,
  tipo       text not null check (tipo in ('aporte', 'retiro')),
  monto      numeric(14,2) not null check (monto > 0),
  cuenta_id  uuid references public.cuentas(id) on delete set null,
  notas      text
);

-- ---------------------------------------------------------------------
-- Préstamos personales (entre personas: lo que me deben / lo que debo)
-- ---------------------------------------------------------------------
create table public.prestamos_personales (
  id           uuid primary key default gen_random_uuid(),
  hogar_id     uuid not null references public.hogares(id) on delete cascade,
  contraparte  text not null,                       -- Melany, Ana, Francisco…
  direccion    text not null check (direccion in ('me_deben', 'debo')),
  persona_id   uuid references public.personas(id) on delete set null,  -- quién del hogar
  monto        numeric(14,2) not null check (monto > 0),
  fecha        date not null,
  fecha_limite date,
  notas        text,
  created_at   timestamptz not null default now()
);

create table public.prestamo_personal_pagos (
  id                   uuid primary key default gen_random_uuid(),
  hogar_id             uuid not null references public.hogares(id) on delete cascade,
  prestamo_personal_id uuid not null references public.prestamos_personales(id) on delete cascade,
  fecha                date not null,
  monto                numeric(14,2) not null check (monto > 0),
  notas                text
);

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------
create index on public.ingresos (hogar_id, fecha);
create index on public.gastos (hogar_id, fecha);
create index on public.gastos (prestamo_id) where prestamo_id is not null;
create index on public.gastos (tarjeta_id) where tarjeta_id is not null;
create index on public.ahorro_movimientos (hogar_id, fecha);
create index on public.tarjeta_movimientos (tarjeta_id, fecha);
create index on public.presupuesto_montos (hogar_id, anio);

-- ---------------------------------------------------------------------
-- Seguridad: cada usuario ve y edita sólo lo de su hogar
-- ---------------------------------------------------------------------
create or replace function public.es_miembro(h uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.miembros m where m.hogar_id = h and m.user_id = auth.uid());
$$;

alter table public.hogares enable row level security;
create policy hogares_select on public.hogares for select using (public.es_miembro(id));
create policy hogares_update on public.hogares for update using (public.es_miembro(id)) with check (public.es_miembro(id));

alter table public.miembros enable row level security;
create policy miembros_select on public.miembros for select using (public.es_miembro(hogar_id));
create policy miembros_update on public.miembros for update using (user_id = auth.uid()) with check (public.es_miembro(hogar_id));

do $$
declare t text;
begin
  foreach t in array array[
    'personas','cuentas','categorias','prestamos','prestamo_abonos','tarjetas',
    'tarjeta_movimientos','presupuesto_conceptos','presupuesto_montos','ingresos',
    'gastos','fondos_ahorro','ahorro_movimientos','prestamos_personales',
    'prestamo_personal_pagos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all using (public.es_miembro(hogar_id)) with check (public.es_miembro(hogar_id))',
      t || '_hogar', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Alta de hogar e invitación
-- ---------------------------------------------------------------------

-- Crea un hogar con catálogos por defecto y agrega al usuario actual.
create or replace function public.crear_hogar(p_nombre text, p_mi_nombre text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  h uuid;
  p uuid;
  i int;
  cats_gasto text[] := array['Vivienda','Servicios','Alimentación','Transporte','Salud','Personal',
                             'Entretenimiento','Deuda - Préstamos','Deuda - Tarjetas','Otros'];
  cats_ingreso text[] := array['Salario','Bono / Incentivo','Ingreso extra','Otros'];
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if exists (select 1 from miembros where user_id = auth.uid()) then
    raise exception 'Ya perteneces a un hogar';
  end if;

  insert into hogares (nombre) values (p_nombre) returning id into h;
  insert into personas (hogar_id, nombre, orden) values (h, p_mi_nombre, 1) returning id into p;
  insert into personas (hogar_id, nombre, es_compartido, orden) values (h, 'Ambos', true, 99);
  insert into miembros (hogar_id, user_id, persona_id) values (h, auth.uid(), p);

  for i in 1 .. array_length(cats_gasto, 1) loop
    insert into categorias (hogar_id, nombre, tipo, orden) values (h, cats_gasto[i], 'gasto', i);
  end loop;
  for i in 1 .. array_length(cats_ingreso, 1) loop
    insert into categorias (hogar_id, nombre, tipo, orden) values (h, cats_ingreso[i], 'ingreso', i);
  end loop;

  insert into cuentas (hogar_id, nombre) values (h, 'Efectivo');
  insert into fondos_ahorro (hogar_id, nombre, orden) values (h, 'Fondo de Emergencia', 1);
  return h;
end $$;

-- Une al usuario actual al hogar del código. Si ya existe una persona con
-- ese nombre (por ejemplo "Husband" creada por la importación) se enlaza.
create or replace function public.unirse_hogar(p_codigo text, p_mi_nombre text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  h uuid;
  p uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if exists (select 1 from miembros where user_id = auth.uid()) then
    raise exception 'Ya perteneces a un hogar';
  end if;
  select id into h from hogares where codigo_invitacion = upper(trim(p_codigo));
  if h is null then raise exception 'Código de invitación no válido'; end if;

  select id into p from personas where hogar_id = h and lower(nombre) = lower(trim(p_mi_nombre));
  if p is null then
    insert into personas (hogar_id, nombre, orden) values (h, trim(p_mi_nombre), 2) returning id into p;
  end if;
  insert into miembros (hogar_id, user_id, persona_id) values (h, auth.uid(), p);
  return h;
end $$;

revoke all on function public.crear_hogar(text, text) from public, anon;
revoke all on function public.unirse_hogar(text, text) from public, anon;
grant execute on function public.crear_hogar(text, text) to authenticated;
grant execute on function public.unirse_hogar(text, text) to authenticated;
grant execute on function public.es_miembro(uuid) to authenticated;

-- Reglas aprendidas al importar estados de cuenta (igual que 0004)
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

-- Permisos de la API para usuarios con sesión (la seguridad la dan las políticas RLS).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
