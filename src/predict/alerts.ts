import type { ModelParams } from "./types";
import { mondayIndex, probAtLeastOne, shiftPlan } from "./model";

// Kolik minut před změnou upozornit.
export const ALERT_LEAD_MIN = 15;
// Plán se dívá o kus dál, ať upozornění neskáče kvůli jedné hodině.
const LOOKAHEAD_H = 3;

export type ShiftAlert = { key: string; title: string; body: string };

// Upozornění pro řidiče na konci hodiny: plán směny (s cenou přesunu) chce
// od další hodiny jiné stanoviště, nebo začíná špička (šance nad `peak`).
// Klíč slouží k odfiltrování opakování.
export function shiftAlert(params: ModelParams, now: Date, peak: number): ShiftAlert | null {
  if (now.getMinutes() < 60 - ALERT_LEAD_MIN) return null;
  const plan = shiftPlan(params, mondayIndex(now), now.getHours(), LOOKAHEAD_H);
  const [cur, next] = plan.hours;
  if (!next || next.best === -1) return null;
  const stand = params.stands[next.best];
  const pNext = probAtLeastOne(next.score);
  const pCur = probAtLeastOne(cur.score);
  const pctTxt = `${Math.round(pNext * 100)} %`;
  const at = `${String(next.h).padStart(2, "0")}:00`;
  const key = `${next.d}-${next.h}`;

  if (cur.best !== next.best) {
    return {
      key,
      title: `Za ${ALERT_LEAD_MIN} min přesun k ${stand.id}`,
      body: `Od ${at} je nejlepší ${stand.name} – přesun ~${Math.round(next.moveMinutes)} min, šance ${pctTxt}.`,
    };
  }
  if (pNext >= peak && pCur < peak) {
    return {
      key,
      title: `Za ${ALERT_LEAD_MIN} min začíná špička`,
      body: `Od ${at} zůstaňte u ${stand.name} – šance ${pctTxt}.`,
    };
  }
  return null;
}
