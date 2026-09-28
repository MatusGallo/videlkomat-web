import { describe, expect, it } from "vitest";
import { czechHoliday, dateFactor, dayKind, easterSunday, isoLocal, weekDates, withCalendar } from "./calendar";
import { mondayIndex, zoneDemand } from "./model";
import { DEMO_PARAMS } from "./demoParams";
import type { CalendarFactors } from "./types";

const CAL: CalendarFactors = {
  month: [0.9, 0.9, 0.9, 1, 1, 1, 0.9, 1, 1.1, 1.1, 1.1, 1],
  holiday: 0.6,
  christmas: 0.4,
  yearEnd: 0.6,
};

describe("calendar", () => {
  it("počítá Velikonoce", () => {
    expect(isoLocal(easterSunday(2024))).toBe("2024-03-31");
    expect(isoLocal(easterSunday(2025))).toBe("2025-04-20");
    expect(isoLocal(easterSunday(2026))).toBe("2026-04-05");
    expect(czechHoliday(new Date(2026, 3, 3))).toBe("Velký pátek");
    expect(czechHoliday(new Date(2026, 3, 6))).toBe("Velikonoční pondělí");
    expect(czechHoliday(new Date(2026, 3, 7))).toBeNull();
  });

  it("rozliší svátek, Vánoce a konec roku", () => {
    expect(dayKind(new Date(2026, 8, 28))).toEqual({ kind: "holiday", name: "Den české státnosti" });
    expect(dayKind(new Date(2026, 11, 25)).kind).toBe("christmas");
    expect(dayKind(new Date(2026, 11, 31))).toEqual({ kind: "yearEnd", name: "Silvestr" });
    expect(dayKind(new Date(2027, 0, 1)).kind).toBe("yearEnd");
    expect(dayKind(new Date(2026, 8, 29))).toEqual({ kind: null, name: null });
  });

  it("násobí měsíc × druh dne", () => {
    expect(dateFactor(CAL, new Date(2026, 8, 29))).toBeCloseTo(1.1);
    expect(dateFactor(CAL, new Date(2026, 8, 28))).toBeCloseTo(1.1 * 0.6);
    expect(dateFactor(undefined, new Date(2026, 8, 28))).toBe(1);
  });

  it("týden od data pokryje každý den v týdnu jednou", () => {
    const from = new Date(2026, 8, 27); // neděle
    const w = weekDates(from);
    expect(w.map(mondayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(isoLocal(w[6])).toBe("2026-09-27");
    expect(isoLocal(w[0])).toBe("2026-09-28");
  });

  it("withCalendar sníží poptávku ve svátek", () => {
    const params = { ...DEMO_PARAMS, calendar: CAL };
    const week = withCalendar(params, new Date(2026, 8, 27));
    const z = params.zones[0];
    // Po 28. 9. je svátek, Út 29. 9. ne.
    expect(zoneDemand(week, z, 0, 10) / zoneDemand(params, z, 0, 10)).toBeCloseTo(1.1 * 0.6);
    expect(zoneDemand(week, z, 1, 10) / zoneDemand(params, z, 1, 10)).toBeCloseTo(1.1);
    // Bez kalendáře beze změny.
    const plain = { ...DEMO_PARAMS, calendar: undefined };
    expect(withCalendar(plain)).toBe(plain);
  });
});
