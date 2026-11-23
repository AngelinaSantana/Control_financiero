import { extractTextItems, getDocumentProxy } from "unpdf";

export class ErrorPdf extends Error {
  constructor(public codigo: "contrasena" | "contrasena_incorrecta" | "ilegible", mensaje: string) {
    super(mensaje);
  }
}

export interface TextoPdf {
  paginas: number;
  /** Texto por página, con las líneas reconstruidas en orden de lectura. */
  texto: string[];
  /** true si casi no tiene texto (probablemente escaneado). */
  esEscaneado: boolean;
  /** true si el PDF venía protegido con contraseña. */
  protegido: boolean;
}

interface Item { str: string; x: number; y: number; height: number }

/**
 * Reconstruye las líneas de una página: agrupa los fragmentos por altura (y)
 * y los ordena de izquierda a derecha, separando columnas con espacios.
 * Así una fila de estado de cuenta ("05/11  PEDIDOS YA  815.00") queda en una línea.
 */
export function lineasDePagina(items: Item[]): string {
  const visibles = items.filter((i) => i.str.trim() !== "");
  const filas: { y: number; alto: number; items: Item[] }[] = [];
  for (const it of [...visibles].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const tolerancia = Math.max(2, (it.height || 8) * 0.5);
    const fila = filas.find((f) => Math.abs(f.y - it.y) <= tolerancia);
    if (fila) fila.items.push(it);
    else filas.push({ y: it.y, alto: it.height || 8, items: [it] });
  }
  return filas
    .sort((a, b) => b.y - a.y)
    .map((f) =>
      f.items
        .sort((a, b) => a.x - b.x)
        .reduce((linea, it, i, arr) => {
          if (i === 0) return it.str;
          const prev = arr[i - 1];
          // Hueco grande entre fragmentos = cambio de columna
          const hueco = it.x - (prev.x + prev.str.length * (prev.height || 8) * 0.5);
          return linea + (hueco > (prev.height || 8) * 1.5 ? "   " : " ") + it.str;
        }, "")
        .replace(/\s+$/, ""),
    )
    .join("\n");
}

export async function leerPdf(datos: Uint8Array, contrasena?: string): Promise<TextoPdf> {
  let protegido = false;
  let doc;
  try {
    doc = await getDocumentProxy(datos, contrasena ? { password: contrasena } : {});
  } catch (e) {
    const nombre = (e as { name?: string })?.name ?? "";
    const codigo = (e as { code?: number })?.code;
    if (nombre === "PasswordException") {
      // code 1 = falta contraseña, 2 = incorrecta (convención de PDF.js)
      if (codigo === 2 || contrasena) throw new ErrorPdf("contrasena_incorrecta", "La contraseña del PDF no es correcta.");
      throw new ErrorPdf("contrasena", "Este PDF tiene contraseña. Escríbela en el campo “Contraseña del PDF” (muchos bancos usan tu cédula).");
    }
    throw new ErrorPdf("ilegible", "No se pudo abrir el archivo. ¿Seguro que es un PDF?");
  }
  if (contrasena) protegido = true;

  const { totalPages, items } = await extractTextItems(doc);
  const texto = items.map((pagina) => lineasDePagina(pagina as Item[]));
  const caracteres = texto.join("").replace(/\s/g, "").length;
  return {
    paginas: totalPages,
    texto,
    esEscaneado: caracteres < 80 * Math.max(totalPages, 1),
    protegido,
  };
}
