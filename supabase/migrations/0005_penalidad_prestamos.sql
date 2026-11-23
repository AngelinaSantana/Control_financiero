-- =====================================================================
-- Penalidad por pago anticipado (fracción: 0.03 = 3 % de lo que abonas
-- o saldas antes de tiempo). La usa el análisis de deudas para no
-- recomendar abonar a un préstamo que te cobra por hacerlo.
-- Se puede ejecutar varias veces sin problema.
-- =====================================================================
alter table public.prestamos
  add column if not exists penalidad_pago_anticipado numeric(6,4) not null default 0;
