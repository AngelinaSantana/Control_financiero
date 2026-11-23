"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/", texto: "Inicio" },
  { href: "/movimientos", texto: "Movimientos" },
  { href: "/importar", texto: "Importar" },
  { href: "/presupuesto", texto: "Presupuesto" },
  { href: "/prestamos", texto: "Préstamos" },
  { href: "/tarjetas", texto: "Tarjetas" },
  { href: "/analisis", texto: "Análisis" },
  { href: "/ahorros", texto: "Ahorros" },
  { href: "/personales", texto: "Personales" },
  { href: "/reportes", texto: "Reportes" },
  { href: "/configuracion", texto: "Configuración" },
];

export function Navegacion() {
  const ruta = usePathname();
  return (
    <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Secciones">
      <ul className="flex gap-1 whitespace-nowrap">
        {ENLACES.map((e) => {
          const activo = e.href === "/" ? ruta === "/" : ruta.startsWith(e.href);
          return (
            <li key={e.href}>
              <Link
                href={e.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium ${activo ? "bg-marca text-white" : "text-tenue hover:bg-fondo hover:text-texto"}`}
              >
                {e.texto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
