// Sekvenční škála poptávky / šance: jeden odstín (oranžová appky), tmavá → světlá
// na tmavém povrchu. Stejná škála pro schéma koridoru i mapu rizika.
const STOPS: [number, [number, number, number]][] = [
  [0, [42, 37, 32]],
  [0.35, [110, 62, 30]],
  [0.7, [244, 113, 30]],
  [1, [255, 197, 138]],
];

export function heatColor(t: number): string {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    if (x <= t1) {
      const [t0, c0] = STOPS[i - 1];
      const f = (x - t0) / (t1 - t0);
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return "rgb(255, 197, 138)";
}

// Gradient pro legendu (CSS linear-gradient).
export const heatGradient = (): string =>
  `linear-gradient(90deg, ${STOPS.map(([t]) => `${heatColor(t)} ${t * 100}%`).join(", ")})`;

export const pct = (p: number): string => {
  const v = p * 100;
  return (v > 0 && v < 1 ? "<1" : Math.round(v).toString()) + " %";
};
