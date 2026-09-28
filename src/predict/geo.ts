import type { GeoPoint } from "./types";

// Odkazy do navigace (v telefonu otevřou aplikaci, jinak web).
export const googleNavUrl = (p: GeoPoint): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(6)},${p.lng.toFixed(6)}&travelmode=driving`;
export const wazeNavUrl = (p: GeoPoint): string => `https://waze.com/ul?ll=${p.lat.toFixed(6)},${p.lng.toFixed(6)}&navigate=yes`;

// Bod ve zlomku t (0–1) délky lomené čáry [lat, lng] – pro umístění výjezdu
// bez vlastní polohy na jeho úsek a pro ikonu uzavírky doprostřed úseku.
export function pointAlong(path: [number, number][], t: number): GeoPoint | null {
  if (path.length === 0) return null;
  if (path.length === 1) return { lat: path[0][0], lng: path[0][1] };
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const dLat = path[i][0] - path[i - 1][0];
    const dLng = (path[i][1] - path[i - 1][1]) * Math.cos((path[i][0] * Math.PI) / 180);
    const len = Math.hypot(dLat, dLng);
    seg.push(len);
    total += len;
  }
  let target = Math.min(1, Math.max(0, t)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) {
      const f = seg[i] > 0 ? Math.min(1, target / seg[i]) : 0;
      return {
        lat: path[i][0] + (path[i + 1][0] - path[i][0]) * f,
        lng: path[i][1] + (path[i + 1][1] - path[i][1]) * f,
      };
    }
    target -= seg[i];
  }
  return null;
}

export const distanceKm = (a: GeoPoint, b: GeoPoint): number => {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = (((b.lng - a.lng) * Math.PI) / 180) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return 6371 * Math.hypot(dLat, dLng);
};

const toPt = (p: [number, number]): GeoPoint => ({ lat: p[0], lng: p[1] });

export const pathLengthKm = (path: [number, number][]): number =>
  path.reduce((s, p, i) => (i ? s + distanceKm(toPt(path[i - 1]), toPt(p)) : 0), 0);

// Nejkratší vzdálenost bodu od lomené čáry [km] (lokální rovinná aproximace).
export function pointToPathKm(p: GeoPoint, path: [number, number][]): number {
  if (path.length === 0) return Infinity;
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110.57;
  const xy = (q: [number, number]) => [(q[1] - p.lng) * kx, (q[0] - p.lat) * ky];
  let best = Infinity;
  for (let i = 0; i < path.length; i++) {
    const [ax, ay] = xy(path[i]);
    if (i === 0) { best = Math.hypot(ax, ay); continue; }
    const [bx, by] = xy(path[i - 1]);
    const dx = ax - bx, dy = ay - by;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(bx * dx + by * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(bx + t * dx, by + t * dy));
  }
  return best;
}

// Přesun mezi dvěma stanovišti [min]: stejný odhad jako dojezd, bez výjezdové minuty navíc.
export const moveMinutes = (a: GeoPoint, b: GeoPoint): number => {
  const d = distanceKm(a, b);
  return d < 0.3 ? 0 : ((d * 1.35) / 50) * 60 + 1;
};

// Odhad dojezdu ve volném provozu [min] bez routovací služby: vzdušná čára
// na 1/3 a 2/3 úseku × 1,35 (klikatost silnic) při 50 km/h + 2 min na výjezd.
// Stejný vzorec jako `build-network --no-osrm`; přesnější dojezdy dá OSRM.
export function estimateT0(from: GeoPoint, path: [number, number][]): number | null {
  const pts = [pointAlong(path, 1 / 3), pointAlong(path, 2 / 3)].filter((p): p is GeoPoint => p !== null);
  if (pts.length === 0) return null;
  const d = pts.reduce((s, p) => s + distanceKm(from, p), 0) / pts.length;
  return Math.round(((d * 1.35) / 50) * 60 + 2);
}

// Stabilní pseudonáhodné číslo 0–1 z řetězce (id výjezdu) – tečky nepřeskakují.
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}
