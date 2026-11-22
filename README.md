# Control_financiero

Control financiero familiar: una app web donde llevan las finanzas en pareja: presupuesto mensual, gastos, ingresos, préstamos, tarjetas, ahorros y préstamos personales.
Cada persona entra con su propia cuenta y las dos ven el mismo presupuesto.

Está basada en el libro `Control_Financiero_Familiar.xlsx` y reproduce sus hojas y fórmulas.

| Hoja del Excel | En la app |
|---|---|
| Config | **Configuración**: año, meta de ahorro, límite de deuda, tasa US$, listas |
| Presupuesto | **Presupuesto**: cuadrícula concepto × mes que se guarda al escribir; también copia un mes a otro |
| Ingresos / Gastos | **Movimientos**: registro, filtros, edición |
| Prestamos + Amort_n | **Préstamos**: interés por días, seguro, amortización y simulador de abonos extra |
| Calendario_Deuda | **Reportes**: pago total por mes y mes en que se libera cada cuota |
| Tarjetas | **Tarjetas**: saldo, utilización, sobregiro, interés y meses para saldar (RD$ y US$) |
| Ahorros | **Ahorros**: fondos, aportes y retiros, meta del fondo de emergencia |
| Resumen / Desviaciones | **Inicio** y **Reportes**: flujo neto, indicadores, planeado vs. real |
| — (nuevo) | **Personales**: lo que te deben y lo que debes a otras personas |

## Tecnología

- **Next.js 15** (React 19, TypeScript, Server Actions) + **Tailwind CSS 4**
- **Supabase**: PostgreSQL, inicio de sesión y seguridad por filas (RLS); cada usuario solo ve los datos de su hogar
- **Recharts** para las gráficas, **Vitest** para las pruebas de los cálculos

```
src/
  app/
    (app)/             pantallas con sesión: inicio, movimientos, presupuesto, préstamos…
    login/  hogar/     inicio de sesión; crear hogar o unirse a uno
    acciones.ts        todas las escrituras (Server Actions)
  components/          interfaz reutilizable
  lib/
    finanzas/          cálculos puros (amortización, tarjetas, resumen) + pruebas
    datos.ts cargas.ts lectura desde Supabase
supabase/migrations/   esquema SQL completo (tablas, RLS, funciones)
scripts/importar_excel.py   importación de tu Excel
```

## Puesta en marcha

### 1. Crear la base de datos en Supabase
1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor**, pega el contenido de `supabase/migrations/0001_esquema.sql` y pulsa **Run**.
3. En **Authentication → Providers → Email**, deja activado Email. Si no quieres confirmar el correo al registrarte, desactiva "Confirm email".
4. En **Project Settings → API** copia la *Project URL* y la *anon public key*.

### 2. Correr la app
```bash
cp .env.example .env.local      # pega la URL y la anon key
npm install
npm run dev                     # http://localhost:3000
```

### 3. Crear el hogar e invitar a tu pareja
1. Crea tu cuenta y elige **Crear un hogar nuevo**. Escribe tu nombre tal como aparece en el Excel (por ejemplo `Wife`).
2. En **Configuración** verás el **código de invitación**.
3. Tu pareja crea su cuenta, elige **Unirme a un hogar**, escribe el código y su nombre (`Husband`). Si ya existe una persona con ese nombre (por la importación), se enlaza con ella.

### 4. Importar los datos del Excel
```bash
pip install openpyxl
python3 scripts/importar_excel.py Control_Financiero_Familiar.xlsx \
    --codigo TU_CODIGO --wife "Wife" --husband "Husband" > importar.sql
```
Pega `importar.sql` en el SQL Editor de Supabase y ejecútalo. El script:
- carga las listas de Config, el presupuesto, los ingresos, los gastos, los préstamos, las tarjetas y los ahorros;
- toma los saldos de préstamos y tarjetas como una **foto** del 31-oct-2026 (cámbiala con `--fecha-foto`). A partir de esa fecha, lo que registres en la app actualiza los saldos;
- convierte a US$ las tarjetas en dólares (con `--tasa 60.95`, la tasa que usaba el Excel);
- se niega a correr dos veces sobre el mismo hogar.

> `importar.sql` y el `.xlsx` contienen tus datos personales: están en `.gitignore` y no deben subirse al repositorio.

### 5. Publicar (opcional)
Importa el repositorio en [Vercel](https://vercel.com), agrega las variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, y despliega.
En Supabase → Authentication → URL Configuration, pon la URL de Vercel como *Site URL*.

## Cómo se calculan las cosas

- **Préstamos**: interés = saldo × (tasa anual ÷ base de días) × días reales del período. Capital = cuota total − interés − seguro. En la última cuota pactada se liquida el saldo restante.
  Si registras un gasto y eliges "¿Es cuota de un préstamo?", el saldo baja solo. Se suman los montos, así que una cuota pagada en dos quincenas cuenta como una.
- **Tarjetas**: saldo = saldo conocido + consumos + cargos − pagos (incluye los gastos marcados como pago de esa tarjeta). El interés estimado sale del saldo que queda después del pago programado.
- **Resumen**: el servicio de deuda es la suma de los gastos en categorías que empiezan con "Deuda". La tasa de ahorro es aportes menos retiros, dividido entre los ingresos.
- **Préstamos personales**: no cuentan como ingreso ni como gasto, para no inflar los ingresos reales.

## Desarrollo
```bash
npm test          # pruebas de los cálculos (validadas contra las cifras del Excel)
npm run lint      # verificación de tipos
npm run build
```
