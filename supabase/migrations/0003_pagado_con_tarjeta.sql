-- =====================================================================
-- Gastos pagados con tarjeta de crédito.
-- pagado_con_tarjeta_id: la compra se hizo con esa tarjeta → cuenta como
--   gasto de su categoría y sube el saldo de la tarjeta (consumo).
-- tarjeta_id (ya existía): el gasto es un PAGO a la tarjeta → baja el saldo
--   y se trata como transferencia (no suma otra vez en los gastos del mes).
-- Se puede ejecutar varias veces sin problema.
-- =====================================================================
alter table public.gastos
  add column if not exists pagado_con_tarjeta_id uuid references public.tarjetas(id) on delete set null;

create index if not exists gastos_pagado_con_tarjeta_idx
  on public.gastos (pagado_con_tarjeta_id) where pagado_con_tarjeta_id is not null;
