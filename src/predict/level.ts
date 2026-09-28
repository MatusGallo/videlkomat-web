import type { ModelParams } from "./types";
import { peakThreshold, weekGrid } from "./model";

// Slovní úroveň šance: absolutní procenta jsou z policejních nehod nízká,
// proto je řadíme proti nejlepším hodinám týdne (horní čtvrtina = Vysoká).
export type ChanceLevel = "high" | "mid" | "low";
export const LEVEL_LABEL: Record<ChanceLevel, string> = { high: "Vysoká", mid: "Střední", low: "Klid" };

export type LevelScale = { high: number; mid: number };

export function levelScale(params: ModelParams): LevelScale {
  const grid = weekGrid(params);
  return { high: peakThreshold(grid, 0.75), mid: peakThreshold(grid, 0.4) };
}

export const chanceLevel = (prob: number, scale: LevelScale): ChanceLevel =>
  prob >= scale.high ? "high" : prob >= scale.mid ? "mid" : "low";
