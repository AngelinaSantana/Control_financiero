// Fechas como texto ISO "YYYY-MM-DD", sin zonas horarias (evita corrimientos de un día).

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [a, m, d];
}

export function iso(a: number, m: number, d: number): string {
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function diasEnMes(a: number, m: number): number {
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** Suma meses conservando el día (ajusta a fin de mes: 31-ene + 1 = 28/29-feb). */
export function sumarMeses(fecha: string, n: number): string {
  const [a, m, d] = partes(fecha);
  const total = a * 12 + (m - 1) + n;
  const na = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(na, nm, Math.min(d, diasEnMes(na, nm)));
}

export function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = partes(desde);
  const [a2, m2, d2] = partes(hasta);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export function hoyISO(): string {
  const f = new Date();
  return iso(f.getFullYear(), f.getMonth() + 1, f.getDate());
}

export function mesDe(fecha: string): number {
  return partes(fecha)[1];
}

export function anioDe(fecha: string): number {
  return partes(fecha)[0];
}

export function formatoFecha(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const [a, m, d] = partes(fecha);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;
}

export function rangoMes(anio: number, mes: number): [string, string] {
  return [iso(anio, mes, 1), iso(anio, mes, diasEnMes(anio, mes))];
}
