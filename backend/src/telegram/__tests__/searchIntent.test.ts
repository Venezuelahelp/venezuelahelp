import { describe, it, expect } from "vitest";
import {
  isBareSearchIntent,
  bareCategoryAction,
  notFoundByName,
} from "@/telegram/searchIntent";

describe("isBareSearchIntent", () => {
  it("detecta intención de búsqueda de persona sin nombre", () => {
    expect(isBareSearchIntent("Buscar a una persona")).toBe(true);
    expect(isBareSearchIntent("buscar a una persona desaparecida")).toBe(true);
    expect(isBareSearchIntent("quiero buscar a alguien")).toBe(true);
    expect(isBareSearchIntent("ayuda a encontrar a un familiar")).toBe(true);
    expect(isBareSearchIntent("buscar")).toBe(true);
  });

  it("NO dispara cuando hay un nombre concreto", () => {
    expect(isBareSearchIntent("buscar a Juan Perez")).toBe(false);
    expect(isBareSearchIntent("Maria Rodriguez")).toBe(false);
    expect(isBareSearchIntent("encontrar a Robeth Enrique")).toBe(false);
  });

  it("NO dispara para búsquedas de otras categorías o zonas", () => {
    expect(isBareSearchIntent("buscar refugios")).toBe(false);
    expect(isBareSearchIntent("personas desaparecidas en La Guaira")).toBe(
      false,
    );
    expect(isBareSearchIntent("dónde hay agua")).toBe(false);
  });

  it("NO dispara sin verbo de búsqueda", () => {
    expect(isBareSearchIntent("hola")).toBe(false);
    expect(isBareSearchIntent("una persona")).toBe(false);
    expect(isBareSearchIntent("")).toBe(false);
  });
});

describe("bareCategoryAction", () => {
  it("mapea una categoría sola a su action de menú", () => {
    expect(bareCategoryAction("acopios")).toBe("insumos");
    expect(bareCategoryAction("centros de acopio")).toBe("insumos");
    expect(bareCategoryAction("refugios")).toBe("refugios");
    expect(bareCategoryAction("ver refugios cerca")).toBe("refugios");
    expect(bareCategoryAction("víveres")).toBe("viveres");
    expect(bareCategoryAction("voluntariado")).toBe("voluntariado");
  });

  it("NO dispara cuando hay una zona concreta", () => {
    expect(bareCategoryAction("acopios en Petare")).toBeNull();
    expect(bareCategoryAction("refugios en La Guaira")).toBeNull();
    expect(bareCategoryAction("agua en Caracas")).toBeNull();
  });

  it("NO dispara para mensajes sin categoría", () => {
    expect(bareCategoryAction("hola")).toBeNull();
    expect(bareCategoryAction("buscar a una persona")).toBeNull();
    expect(bareCategoryAction("")).toBeNull();
  });
});

describe("notFoundByName", () => {
  it("incluye el nombre buscado y no es el 'No tengo ese dato' seco", () => {
    const msg = notFoundByName("Pedro Gonzalez");
    expect(msg).toContain("Pedro Gonzalez");
    expect(msg).not.toBe("No tengo ese dato.");
    expect(msg.toLowerCase()).toContain("nombre completo");
  });
});
