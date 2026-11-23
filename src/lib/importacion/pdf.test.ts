import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ErrorPdf, leerPdf } from "./pdf";

const archivo = (n: string) => new Uint8Array(readFileSync(`src/lib/importacion/__fixtures__/${n}`));

describe("leerPdf", () => {
  it("reconstruye cada fila del estado en una línea", async () => {
    const r = await leerPdf(archivo("estado_prueba.pdf"));
    expect(r.paginas).toBe(1);
    expect(r.esEscaneado).toBe(false);
    const lineas = r.texto[0].split("\n");
    expect(lineas.find((l) => l.includes("PEDIDOS YA"))).toMatch(/12\/10\/2026.*PEDIDOS YA.*815\.00/);
    expect(lineas.find((l) => l.includes("SU PAGO"))).toMatch(/20\/10\/2026.*SU PAGO GRACIAS.*5,000\.00/);
  });
  it("pide la contraseña si el PDF está protegido", async () => {
    await expect(leerPdf(archivo("estado_prueba_clave.pdf"))).rejects.toMatchObject({ codigo: "contrasena" });
  });
  it("avisa si la contraseña es incorrecta", async () => {
    await expect(leerPdf(archivo("estado_prueba_clave.pdf"), "999")).rejects.toBeInstanceOf(ErrorPdf);
  });
  it("abre el PDF con la contraseña correcta", async () => {
    const r = await leerPdf(archivo("estado_prueba_clave.pdf"), "00112345678");
    expect(r.protegido).toBe(true);
    expect(r.texto[0]).toContain("SUPERMERCADO NACIONAL");
  });
});
