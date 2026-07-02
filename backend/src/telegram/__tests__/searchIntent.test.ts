import { describe, it, expect } from "vitest";
import {
  isBareSearchIntent,
  bareCategoryAction,
  looksLikePersonName,
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

describe("looksLikePersonName", () => {
  it("reconoce un nombre propio suelto (2–4 palabras)", () => {
    expect(looksLikePersonName("Robeth Enrique")).toBe(true);
    expect(looksLikePersonName("Ana Perez")).toBe(true);
    expect(looksLikePersonName("Maria Jose Rodriguez")).toBe(true);
    expect(looksLikePersonName("Robeth Enrique Perez Lopez")).toBe(true);
  });

  it("NO dispara para preguntas (interrogativos o signos)", () => {
    expect(looksLikePersonName("dónde hay agua")).toBe(false);
    expect(looksLikePersonName("¿quién eres?")).toBe(false);
    expect(looksLikePersonName("cuántos desaparecidos hay")).toBe(false);
  });

  it("NO dispara para mensajes fuera de tema ni comandos de búsqueda", () => {
    expect(looksLikePersonName("cuéntame un chiste")).toBe(false);
    expect(looksLikePersonName("buscar a Juan")).toBe(false);
    expect(looksLikePersonName("háblame de política")).toBe(false);
  });

  it("NO dispara para categorías ni longitudes fuera de rango", () => {
    expect(looksLikePersonName("refugios")).toBe(false); // 1 palabra
    expect(looksLikePersonName("acopios refugios")).toBe(false); // categoría
    expect(looksLikePersonName("")).toBe(false);
    expect(looksLikePersonName("uno dos tres cuatro cinco palabras aqui")).toBe(
      false,
    ); // >4 palabras
  });

  it("NO dispara si hay dígitos (no es un nombre)", () => {
    expect(looksLikePersonName("calle 5")).toBe(false);
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
