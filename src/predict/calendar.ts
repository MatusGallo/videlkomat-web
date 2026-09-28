import type { CalendarFactors, ModelParams } from "./types";
import { mondayIndex } from "./model";

// Český kalendář pro model: státní svátky (vč. Velikonoc), Vánoce a konec roku.
// Koeficienty (CalendarFactors) spočítá import z historie nehod; tady je jen
// rozpoznání dne a jejich použití na konkrétní datum.

export type DayKind = "holiday" | "christmas" | "yearEnd";

const FIXED: Record<string, string> = {
  "01-01": "Nový rok",
  "05-01": "Svátek práce",
  "05-08": "Den vítězství",
  "07-05": "Cyril a Metoděj",
  "07-06": "Mistr Jan Hus",
  "09-28": "Den české státnosti",
  "10-28": "Vznik Československa",
  "11-17": "Den boje za svobodu",
  "12-24": "Štědrý den",
  "12-25": "1. svátek vánoční",
  "12-26": "2. svátek vánoční",
};

const pad = (n: number) => String(n).padStart(2, "0");
// Místní datum → "YYYY-MM-DD" (bez posunu přes UTC).
export const isoLocal = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Velikonoční neděle (gregoriánský výpočet, Meeus/Jones/Butcher).
export function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const easterCache = new Map<number, { friday: string; monday: string }>();
const easterOf = (year: number) => {
  let e = easterCache.get(year);
  if (!e) {
    const s = easterSunday(year);
    e = {
      friday: isoLocal(new Date(year, s.getMonth(), s.getDate() - 2)),
      monday: isoLocal(new Date(year, s.getMonth(), s.getDate() + 1)),
    };
    easterCache.set(year, e);
  }
  return e;
};

// Název státního svátku, nebo null.
export function czechHoliday(date: Date): string | null {
  const iso = isoLocal(date);
  const fixed = FIXED[iso.slice(5)];
  if (fixed) return fixed;
  const e = easterOf(date.getFullYear());
  if (iso === e.friday) return "Velký pátek";
  if (iso === e.monday) return "Velikonoční pondělí";
  return null;
}

// Druh dne pro model. Vánoce (24.–26. 12.) a konec roku (27. 12.–1. 1.) mají
// vlastní koeficient – provoz je tam jiný než v běžný svátek.
export function dayKind(date: Date): { kind: DayKind | null; name: string | null } {
  const md = isoLocal(date).slice(5);
  const name = czechHoliday(date);
  if (md >= "12-24" && md <= "12-26") return { kind: "christmas", name };
  if (md >= "12-27" || md === "01-01") return { kind: "yearEnd", name: name ?? (md === "12-31" ? "Silvestr" : "Mezi svátky") };
  return { kind: name ? "holiday" : null, name };
}

// Násobek poptávky pro konkrétní datum (měsíc × druh dne).
export function dateFactor(cal: CalendarFactors | undefined, date: Date): number {
  if (!cal) return 1;
  const { kind } = dayKind(date);
  return (cal.month[date.getMonth()] ?? 1) * (kind ? cal[kind] : 1);
}

// Data dnů Po–Ne v nejbližších 7 dnech od `from` (index = den v týdnu).
export function weekDates(from: Date): Date[] {
  const out: Date[] = new Array(7);
  for (let i = 0; i < 7; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    out[mondayIndex(d)] = d;
  }
  return out;
}

// Parametry pro nejbližší týden: každý den v týdnu dostane násobek svého data.
// Jen pro výpočet – dateScale se nikdy neukládá (úpravy dělat nad původními params).
export const withCalendar = (params: ModelParams, from = new Date()): ModelParams =>
  params.calendar ? { ...params, dateScale: weekDates(from).map((d) => dateFactor(params.calendar, d)) } : params;

export type DayInfo = { date: Date; kind: DayKind | null; name: string | null; factor: number; monthFactor: number };

export function dayInfo(params: ModelParams, date: Date): DayInfo {
  const { kind, name } = dayKind(date);
  return {
    date,
    kind,
    name,
    factor: dateFactor(params.calendar, date),
    monthFactor: params.calendar?.month[date.getMonth()] ?? 1,
  };
}
