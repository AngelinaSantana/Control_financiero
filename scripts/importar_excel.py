#!/usr/bin/env python3
"""
Genera un archivo SQL para cargar el libro Control_Financiero_Familiar.xlsx
en un hogar ya creado en la app.

Uso:
    pip install openpyxl
    python3 scripts/importar_excel.py Control_Financiero_Familiar.xlsx \
        --codigo ABCD1234 --wife "Wife" --husband "Husband" > importar.sql

Luego pega importar.sql en Supabase → SQL Editor → Run.

  --codigo   Código de invitación del hogar (se ve en Configuración).
  --wife / --husband
             Nombre con el que cada uno aparece en la app. Los responsables
             "Wife" y "Husband" del Excel se asignan a esas personas; "Couple"
             va a la persona compartida ("Ambos").
  --tasa     RD$ por US$ usada en el Excel para las tarjetas en dólares.
  --fecha-foto
             Fecha en la que se tomaron los saldos de préstamos y tarjetas.

El archivo generado contiene tus datos financieros: no lo subas al repositorio.
"""
import argparse
import datetime as dt
import sys

import openpyxl

MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
         "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
QUINCENA = {"Q1 - 15": "Q1", "Q2 - 30": "Q2", "Ambas /2": "Ambas", "N/A": "N/A"}
TIPO = {"Fijo": "Fijo", "Variable": "Variable", "Pago Unico": "Pago único", "Pago único": "Pago único"}


def q(v):
    """Literal SQL seguro."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(round(float(v), 6))
    if isinstance(v, (dt.datetime, dt.date)):
        return "'" + v.strftime("%Y-%m-%d") + "'"
    return "'" + str(v).replace("'", "''").strip() + "'"


def num(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


class Gen:
    def __init__(self, args):
        self.a = args
        self.out = []

    def w(self, s):
        self.out.append(s)

    # Subconsultas de búsqueda por nombre dentro del hogar h
    def persona(self, nombre):
        if not nombre:
            return "null"
        if nombre == "Couple":
            return "(select id from personas where hogar_id = h and es_compartido limit 1)"
        real = {"Wife": self.a.wife, "Husband": self.a.husband}.get(nombre, nombre)
        return f"(select id from personas where hogar_id = h and lower(nombre) = lower({q(real)}))"

    def cuenta(self, nombre):
        return "null" if not nombre else f"(select id from cuentas where hogar_id = h and nombre = {q(nombre)})"

    def categoria(self, nombre, tipo):
        return "null" if not nombre else (
            f"(select id from categorias where hogar_id = h and tipo = '{tipo}' and nombre = {q(nombre)})")


def filas(ws, desde):
    for r in ws.iter_rows(min_row=desde, values_only=True):
        if r[0] is None or not isinstance(r[0], (dt.datetime, dt.date)):
            continue
        yield r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("--codigo", required=True)
    ap.add_argument("--wife", default="Wife")
    ap.add_argument("--husband", default="Husband")
    ap.add_argument("--tasa", type=float, default=60.95)
    ap.add_argument("--fecha-foto", default="2026-10-31")
    a = ap.parse_args()

    wb = openpyxl.load_workbook(a.xlsx, data_only=True)
    g = Gen(a)
    w = g.w
    foto = q(a.fecha_foto)

    w("-- Generado por scripts/importar_excel.py — contiene datos personales, no lo subas a git.")
    w("do $$")
    w("declare h uuid; c uuid;")
    w("begin")
    w(f"  select id into h from hogares where codigo_invitacion = upper({q(a.codigo)});")
    w("  if h is null then raise exception 'No existe un hogar con ese código'; end if;")
    w("  if exists (select 1 from gastos where hogar_id = h) or exists (select 1 from ingresos where hogar_id = h) then")
    w("    raise exception 'Este hogar ya tiene movimientos; la importación sólo se hace una vez';")
    w("  end if;")

    # --- Config ---
    cfg = {r[0]: r[1] for r in wb["Config"].iter_rows(min_row=5, max_row=10, values_only=True) if r[0]}
    w(f"  update hogares set anio_trabajo = {int(num(cfg.get('Año de trabajo')) or 2026)},"
      f" meta_ahorro = {num(cfg.get('Meta de tasa de ahorro')) or 0.2},"
      f" limite_deuda = {num(cfg.get('Límite recomendado de servicio de deuda')) or 0.3},"
      f" tasa_cambio_usd = {a.tasa} where id = h;")

    # --- Catálogos (listas de Config) ---
    listas = {"gasto": set(), "ingreso": set(), "cuenta": set(), "fondo": set(), "persona": set()}
    for r in wb["Config"].iter_rows(min_row=13, max_row=30, values_only=True):
        if r[2]: listas["gasto"].add(r[2])
        if r[4]: listas["ingreso"].add(r[4])
        if r[8]: listas["persona"].add(r[8])
        if r[10]: listas["cuenta"].add(r[10])
        if r[14]: listas["fondo"].add(r[14])
    for p in sorted(listas["persona"] - {"Couple"}):
        real = {"Wife": a.wife, "Husband": a.husband}.get(p, p)
        w(f"  insert into personas (hogar_id, nombre, orden) values (h, {q(real)}, 5) on conflict do nothing;")
    for i, c in enumerate(sorted(listas["gasto"]), 20):
        w(f"  insert into categorias (hogar_id, nombre, tipo, orden) values (h, {q(c)}, 'gasto', {i}) on conflict do nothing;")
    for i, c in enumerate(sorted(listas["ingreso"]), 20):
        w(f"  insert into categorias (hogar_id, nombre, tipo, orden) values (h, {q(c)}, 'ingreso', {i}) on conflict do nothing;")
    for c in sorted(listas["cuenta"]):
        w(f"  insert into cuentas (hogar_id, nombre) values (h, {q(c)}) on conflict do nothing;")
    for i, c in enumerate(sorted(listas["fondo"]), 1):
        w(f"  insert into fondos_ahorro (hogar_id, nombre, orden) values (h, {q(c)}, {i}) on conflict do nothing;")

    # --- Presupuesto ---
    ws = wb["Presupuesto"]
    anio = int(num(cfg.get("Año de trabajo")) or 2026)
    orden = 0
    for r in ws.iter_rows(min_row=5, values_only=True):
        cat, concepto = r[0], r[1]
        if not cat or not concepto or str(cat).startswith(("TOTAL", "RESUMEN", "Nota")):
            continue
        if cat not in listas["gasto"]:
            continue
        orden += 1
        w(f"  insert into presupuesto_conceptos (hogar_id, categoria_id, concepto, tipo, persona_id, quincena, cuenta_id, orden)"
          f" values (h, {g.categoria(cat, 'gasto')}, {q(concepto)}, {q(TIPO.get(r[2], 'Variable'))}, {g.persona(r[3])},"
          f" {q(QUINCENA.get(r[4], 'N/A'))}, {g.cuenta(r[5])}, {orden}) returning id into c;")
        montos = [(m + 1, num(r[6 + m])) for m in range(12) if num(r[6 + m])]
        if montos:
            vals = ", ".join(f"(h, c, {anio}, {m}, {v:.2f})" for m, v in montos)
            w(f"  insert into presupuesto_montos (hogar_id, concepto_id, anio, mes, monto) values {vals};")

    # --- Ingresos ---
    n_ing = 0
    for r in filas(wb["Ingresos"], 5):
        fecha, _, _, resp, concepto, cat, tipo, cuenta, quin, monto, notas = r[:11]
        if not num(monto):
            continue
        n_ing += 1
        w(f"  insert into ingresos (hogar_id, fecha, persona_id, concepto, categoria_id, tipo, cuenta_id, quincena, monto, notas)"
          f" values (h, {q(fecha)}, {g.persona(resp)}, {q(concepto or 'Sin concepto')}, {g.categoria(cat, 'ingreso')},"
          f" {q(TIPO.get(tipo, 'Variable'))}, {g.cuenta(cuenta)}, {q(QUINCENA.get(quin, 'N/A'))}, {num(monto):.2f}, {q(notas)});")

    # --- Gastos ---
    n_gas = 0
    for r in filas(wb["Gastos"], 5):
        fecha, _, _, concepto, cat, tipo, resp, cuenta, quin, monto, notas = r[:11]
        if not num(monto):
            continue
        n_gas += 1
        w(f"  insert into gastos (hogar_id, fecha, persona_id, concepto, categoria_id, tipo, cuenta_id, quincena, monto, notas)"
          f" values (h, {q(fecha)}, {g.persona(resp)}, {q(concepto or 'Sin concepto')}, {g.categoria(cat, 'gasto')},"
          f" {q(TIPO.get(tipo, 'Variable'))}, {g.cuenta(cuenta)}, {q(QUINCENA.get(quin, 'N/A'))}, {num(monto):.2f}, {q(notas)});")

    # --- Préstamos ---
    n_pre = 0
    for r in wb["Prestamos"].iter_rows(min_row=4, values_only=True):
        desc = r[1]
        if not desc or str(desc).startswith("TOTAL") or not isinstance(r[3], (dt.datetime, dt.date)):
            continue
        if not r[0]:
            # Préstamo de una persona (p. ej. "Prestamo Ana") → préstamos personales
            monto = num(r[5]); cuota = num(r[11]); pagadas = int(num(r[9]))
            w(f"  insert into prestamos_personales (hogar_id, contraparte, direccion, persona_id, monto, fecha, notas)"
              f" values (h, {q(str(desc).replace('Prestamo', '').replace('Préstamo', '').strip() or desc)}, 'debo',"
              f" {g.persona(r[2])}, {monto:.2f}, {q(r[3])}, 'Importado de la hoja Préstamos') returning id into c;")
            for k in range(pagadas):
                f = r[4] + dt.timedelta(days=30 * k)
                w(f"  insert into prestamo_personal_pagos (hogar_id, prestamo_personal_id, fecha, monto) values (h, c, {q(f)}, {cuota:.2f});")
            continue
        n_pre += 1
        w("  insert into prestamos (hogar_id, acreedor, descripcion, persona_id, fecha_inicio, fecha_primera_cuota, monto_original,"
          " tasa_anual, base_dias, cuotas_totales, cuota_total, seguro_cuota, saldo_referencia, cuotas_pagadas_referencia, fecha_referencia)"
          f" values (h, {q(r[0])}, {q(desc)}, {g.persona(r[2])}, {q(r[3])}, {q(r[4])}, {num(r[5]):.2f}, {num(r[6])},"
          f" {int(num(r[7]) or 360)}, {int(num(r[8]))}, {num(r[11]):.2f}, {num(r[12]):.2f}, {num(r[13]):.2f}, {int(num(r[9]))}, {foto});")

    # --- Tarjetas (montos del Excel en RD$; las de dólares se convierten a US$) ---
    n_tar = 0
    for r in wb["Tarjetas"].iter_rows(min_row=4, values_only=True):
        nombre = r[0]
        if not nombre or str(nombre).startswith(("TOTAL", "Cómo", "•", "Fuente")) or r[1] is None \
                or not isinstance(r[2], (int, float)):
            continue
        n_tar += 1
        usd = "dolar" in str(nombre).lower()
        f = (1 / a.tasa) if usd else 1
        dia = lambda v: int(num(v)) if num(v) else None
        opt = lambda v: f"{num(v) * f:.2f}" if v not in (None, "") else "null"
        w("  insert into tarjetas (hogar_id, nombre, persona_id, moneda, limite, tasa_anual, dia_corte, dia_pago,"
          " pago_minimo, pago_programado, saldo_referencia, fecha_referencia)"
          f" values (h, {q(nombre)}, {g.persona(r[1])}, '{'USD' if usd else 'DOP'}', {num(r[2]) * f:.2f}, {num(r[8]) or 0.6},"
          f" {q(dia(r[17]))}, {q(dia(r[18]))}, {opt(r[12])}, {opt(r[13])}, {num(r[6]) * f:.2f}, {foto});")

    # --- Ahorros ---
    n_aho = 0
    for r in filas(wb["Ahorros"], 5):
        fecha, _, _, fondo, resp, mov, monto, cuenta, notas = r[:9]
        if not num(monto) or not fondo:
            continue
        n_aho += 1
        w(f"  insert into ahorro_movimientos (hogar_id, fondo_id, fecha, persona_id, tipo, monto, cuenta_id, notas)"
          f" values (h, (select id from fondos_ahorro where hogar_id = h and nombre = {q(fondo)}), {q(fecha)}, {g.persona(resp)},"
          f" {q('retiro' if str(mov).lower().startswith('retiro') else 'aporte')}, {num(monto):.2f}, {g.cuenta(cuenta)}, {q(notas)});")

    w(f"  raise notice 'Importados: % ingresos, % gastos, % préstamos, % tarjetas, % movimientos de ahorro',"
      f" {n_ing}, {n_gas}, {n_pre}, {n_tar}, {n_aho};")
    w("end $$;")
    sys.stdout.write("\n".join(g.out) + "\n")
    print(f"OK: {n_ing} ingresos, {n_gas} gastos, {n_pre} préstamos, {n_tar} tarjetas, {n_aho} ahorros", file=sys.stderr)


if __name__ == "__main__":
    main()
