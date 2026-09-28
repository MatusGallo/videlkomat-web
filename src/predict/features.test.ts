import { describe, expect, it } from "vitest";
import { CORRIDOR_PARAMS as DEMO_PARAMS } from "./corridorParams";
import { evaluate, peakThreshold, shiftExpectation, shiftPlan, standReach, weekGrid, zoneDayProfile } from "./model";
import { shiftAlert } from "./alerts";
import { hash01, pointAlong } from "./geo";

describe("plán směny", () => {
  it("bez ceny přesunu = součet nejlepších hodin; bloky pokrývají všechny hodiny", () => {
    for (const [d, h, n] of [[0, 6, 8], [6, 20, 8], [4, 14, 12], [2, 0, 1]]) {
      const plan = shiftPlan(DEMO_PARAMS, d, h, n, { move: () => 0 });
      expect(plan.hours).toHaveLength(n);
      expect(plan.blocks.reduce((s, b) => s + b.hours, 0)).toBe(n);
      expect(plan.expected).toBeCloseTo(shiftExpectation(DEMO_PARAMS, d, h, n), 12);
      expect(plan.blocks.reduce((s, b) => s + b.expected, 0)).toBeCloseTo(plan.expected, 12);
    }
  });
  it("cena přesunu plán nikdy nezlepší a drahý přesun ho zruší", () => {
    for (const [d, h] of [[0, 6], [4, 14], [6, 20]]) {
      const free = shiftPlan(DEMO_PARAMS, d, h, 8, { move: () => 0 }).expected;
      const real = shiftPlan(DEMO_PARAMS, d, h, 8);
      expect(real.expected).toBeLessThanOrEqual(free + 1e-12);
      const stuck = shiftPlan(DEMO_PARAMS, d, h, 8, { move: (a, b) => (a.id === b.id ? 0 : 60) });
      expect(stuck.blocks).toHaveLength(1);
    }
  });
  it("přesun v plánu nese dobu jízdy a snižuje výnos té hodiny", () => {
    const plan = shiftPlan(DEMO_PARAMS, 0, 5, 12);
    for (let i = 1; i < plan.hours.length; i++) {
      const p = plan.hours[i];
      if (p.best !== plan.hours[i - 1].best) {
        expect(p.moveMinutes).toBeGreaterThan(0);
        expect(p.score).toBeLessThan(evaluate(DEMO_PARAMS, p.d, p.h).scores[p.best]);
      } else expect(p.moveMinutes).toBe(0);
    }
  });
  it("sousední bloky mají různé stanoviště a začínají v první hodině bloku", () => {
    const plan = shiftPlan(DEMO_PARAMS, 6, 18, 12);
    for (let i = 1; i < plan.blocks.length; i++) expect(plan.blocks[i].best).not.toBe(plan.blocks[i - 1].best);
    expect([plan.blocks[0].d, plan.blocks[0].h]).toEqual([6, 18]);
    // přes půlnoc z neděle na pondělí
    expect(plan.hours.at(-1)).toMatchObject({ d: 0, h: 5 });
  });
});

describe("detail úseku a dosah", () => {
  it("profil úseku přes den odpovídá evaluate()", () => {
    const zone = DEMO_PARAMS.zones[2];
    const prof = zoneDayProfile(DEMO_PARAMS, zone, 3);
    prof.forEach((v, h) => expect(v).toBeCloseTo(evaluate(DEMO_PARAMS, 3, h).lam[2], 12));
  });
  it("dosah: bližší úsek má vyšší šanci; skóre = Σ λ × p", () => {
    const st = DEMO_PARAMS.stands[0]; // A: js 5, st1 4, st2 8, d0 11
    const reach = standReach(DEMO_PARAMS, st, 1, 3);
    const by = Object.fromEntries(reach.map((r) => [r.zoneId, r]));
    expect(by.st1.capture).toBeGreaterThan(by.d0.capture);
    expect(by.st1.minutes).toBeCloseTo(4, 12); // ve 3 ráno bez kongesce
    const ev = evaluate(DEMO_PARAMS, 1, 3);
    const score = reach.reduce((s, r, i) => s + ev.lam[i] * r.capture, 0);
    expect(score).toBeCloseTo(ev.scores[0], 12);
  });
});

describe("upozornění", () => {
  const peak = peakThreshold(weekGrid(DEMO_PARAMS));
  it("mimo posledních 15 min hodiny mlčí", () => {
    expect(shiftAlert(DEMO_PARAMS, new Date(2026, 8, 25, 16, 20), peak)).toBeNull();
  });
  it("hlásí přesun 15 min předem, když plán směny mění stanoviště", () => {
    // Stanoviště bez polohy = přesun zdarma, takže plán mění stanoviště častěji.
    const P = { ...DEMO_PARAMS, stands: DEMO_PARAMS.stands.map((st) => ({ ...st, geo: undefined })) };
    let found = false;
    for (let day = 0; day < 7 && !found; day++) {
      for (let h = 0; h < 23 && !found; h++) {
        const plan = shiftPlan(P, day, h, 3);
        const a = plan.hours[0].best;
        const b = plan.hours[1].best;
        if (a !== b) {
          // 2026-09-21 je pondělí
          const alert = shiftAlert(P, new Date(2026, 8, 21 + day, h, 50), peak);
          expect(alert?.title).toContain("přesun k " + DEMO_PARAMS.stands[b].id);
          expect(alert?.key).toBe(`${day}-${h + 1}`);
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });
  it("hranice špičky je horní čtvrtina týdne", () => {
    const grid = weekGrid(DEMO_PARAMS);
    const t = peakThreshold(grid);
    const above = grid.flat().filter((c) => c.prob >= t).length;
    expect(above).toBeGreaterThanOrEqual(42);
    expect(above).toBeLessThanOrEqual(44);
  });
});

describe("geo", () => {
  const path: [number, number][] = [[50, 14], [50, 14.1], [50.1, 14.1]];
  it("pointAlong vrací konce a leží na čáře", () => {
    expect(pointAlong(path, 0)).toEqual({ lat: 50, lng: 14 });
    const end = pointAlong(path, 1)!;
    expect(end.lat).toBeCloseTo(50.1, 9);
    expect(end.lng).toBeCloseTo(14.1, 9);
    const mid = pointAlong(path, 0.3)!;
    expect(mid.lat).toBeCloseTo(50, 9);
    expect(pointAlong([], 0.5)).toBeNull();
  });
  it("hash01 je stabilní a v rozsahu", () => {
    expect(hash01("abc")).toBe(hash01("abc"));
    for (const s of ["a", "b", "job-1", "x".repeat(40)]) {
      expect(hash01(s)).toBeGreaterThanOrEqual(0);
      expect(hash01(s)).toBeLessThan(1);
    }
  });
});
