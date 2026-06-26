export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6371; // radio terrestre en km

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function sortByDistance<
  T extends { ubicacion?: { lat: number; lng: number } },
>(items: T[], from: LatLng): T[] {
  const withGeo: Array<{ item: T; d: number }> = [];
  const without: T[] = [];
  for (const item of items) {
    if (item.ubicacion) {
      withGeo.push({ item, d: haversineKm(from, item.ubicacion) });
    } else {
      without.push(item);
    }
  }
  withGeo.sort((a, b) => a.d - b.d);
  return [...withGeo.map((x) => x.item), ...without];
}
