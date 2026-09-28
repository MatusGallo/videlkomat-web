import { describe, expect, it } from "vitest";
import { CORRIDOR_PARAMS as DEMO_PARAMS } from "./corridorParams";
import {
  addHours, captureProb, evaluate, hourShare, normalizeProfile, probAtLeastOne,
  shiftExpectation, topWindows, weekGrid,
} from "./model";
import { calibrate, fitLogistic, withCalibration } from "./calibrate";
import { jobsToCSV } from "./exportJobs";
import type { JobLog } from "./types";

// ── Referenční implementace ze zadání (sekce 3.6), doslova ─────────────────
const SEGMENTS = [
  { id: "js", annual: 260, weight: 1.0 },
  { id: "st1", annual: 200, weight: 1.0 },
  { id: "st2", annual: 160, weight: 1.3 },
  { id: "d0", annual: 120, weight: 1.0 },
];
const STANDS = [
  { id: "A", t0: [5, 4, 8, 11] },
  { id: "B", t0: [9, 4, 4, 8] },
  { id: "C", t0: [16, 11, 7, 5] },
  { id: "D", t0: [4, 9, 13, 16] },
];
const WEEKDAY = [0.012,0.008,0.007,0.007,0.010,0.022,0.050,0.078,0.070,0.052,0.045,0.047,
                 0.050,0.052,0.058,0.068,0.075,0.072,0.058,0.042,0.032,0.026,0.021,0.016];
const WEEKEND = [0.025,0.020,0.016,0.012,0.010,0.012,0.018,0.025,0.035,0.048,0.058,0.065,
                 0.068,0.068,0.067,0.066,0.064,0.060,0.055,0.048,0.042,0.036,0.032,0.028];
const CONGESTION = [0,0,0,0,0,0.1,0.5,1,0.9,0.4,0.2,0.2,0.25,0.3,0.45,0.8,1,0.85,0.4,0.15,0.05,0,0,0];
const DAY_FACTOR = [1, 0.97, 0.98, 1.03, 1.15, 0.72, 0.65];

function referenceModel(d: number, h: number) {
  const prof = d >= 5 ? WEEKEND : WEEKDAY;
  const share = prof[h] / prof.reduce((a, b) => a + b, 0);
  const avg = DAY_FACTOR.reduce((a, b) => a + b, 0) / 7;
  const cong = (d >= 5 ? 0.25 : 1) * CONGESTION[h];
  const lam = SEGMENTS.map((s) => ((s.annual * s.weight) / 365) * (DAY_FACTOR[d] / avg) * share);
  const scores = STANDS.map((st) =>
    lam.reduce((sum, l, i) => {
      const T = st.t0[i] * (1 + 1.3 * cong);
      return sum + l / (1 + Math.exp((T - 12) / 2.5));
    }, 0),
  );
  return { lam, scores };
}

describe("model – shoda s referenční implementací", () => {
  it("vrací stejné λ i skóre pro všech 7 × 24 hodin", () => {
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const ref = referenceModel(d, h);
        const ev = evaluate(DEMO_PARAMS, d, h);
        ev.lam.forEach((v, i) => expect(v).toBeCloseTo(ref.lam[i], 12));
        ev.scores.forEach((v, i) => expect(v).toBeCloseTo(ref.scores[i], 12));
        const refBest = ref.scores.indexOf(Math.max(...ref.scores));
        expect(ev.best).toBe(refBest);
      }
    }
  });
});

describe("profily", () => {
  it("podíly hodin dávají za den součet 1", () => {
    for (const d of [0, 4, 5, 6]) {
      const total = Array.from({ length: 24 }, (_, h) => hourShare(DEMO_PARAMS, d, h)).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 12);
    }
  });
  it("normalizeProfile vrací součet 1 a nulový profil nechá nulový", () => {
    expect(normalizeProfile([1, 3]).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(normalizeProfile([0, 0])).toEqual([0, 0]);
  });
  it("denní poptávka (Σ λ přes hodiny) odpovídá A × W / 365 × DF / mean(DF)", () => {
    const avg = DAY_FACTOR.reduce((a, b) => a + b, 0) / 7;
    const d = 4;
    const daily = Array.from({ length: 24 }, (_, h) => evaluate(DEMO_PARAMS, d, h).lam[0]).reduce((a, b) => a + b, 0);
    expect(daily).toBeCloseTo((260 / 365) * (DAY_FACTOR[d] / avg), 12);
  });
});

describe("p(T)", () => {
  const cap = DEMO_PARAMS.capture;
  it("je klesající v čase dojezdu", () => {
    let prev = Infinity;
    for (let T = 0; T <= 40; T += 0.5) {
      const p = captureProb(T, cap);
      expect(p).toBeLessThan(prev);
      prev = p;
    }
  });
  it("v T_half je 0,5 a leží v (0, 1)", () => {
    expect(captureProb(cap.tHalf, cap)).toBeCloseTo(0.5, 12);
    expect(captureProb(0, cap)).toBeLessThan(1);
    expect(captureProb(60, cap)).toBeGreaterThan(0);
  });
  it("nedosažitelné stanoviště (chybí T0) má nulový příspěvek", () => {
    expect(captureProb(Infinity, cap)).toBe(0);
    const params = { ...DEMO_PARAMS, stands: [{ id: "X", name: "X", t0: {} }] };
    expect(evaluate(params, 0, 8).scores[0]).toBe(0);
  });
  it("P(≥1) = 1 − e^−skóre", () => {
    expect(probAtLeastOne(0)).toBe(0);
    expect(probAtLeastOne(1)).toBeCloseTo(1 - Math.exp(-1), 12);
  });
});

describe("víkend vs. pracovní den", () => {
  it("ranní špička v 7:00 je silnější v pracovní den", () => {
    const wd = evaluate(DEMO_PARAMS, 1, 7);
    const we = evaluate(DEMO_PARAMS, 6, 7);
    expect(wd.lam[0]).toBeGreaterThan(we.lam[0]);
  });
  it("o víkendu je kongesce slabší → vyšší p(T) při stejné poptávce", () => {
    const flat = { ...DEMO_PARAMS, dayFactor: [1, 1, 1, 1, 1, 1, 1], profiles: { weekday: WEEKDAY, weekend: WEEKDAY } };
    const wd = evaluate(flat, 2, 17);
    const we = evaluate(flat, 5, 17);
    wd.lam.forEach((l, i) => expect(we.lam[i]).toBeCloseTo(l, 12));
    wd.scores.forEach((s, i) => expect(we.scores[i]).toBeGreaterThan(s));
  });
});

describe("směna přes půlnoc", () => {
  it("addHours přechází na další den i z neděle na pondělí", () => {
    expect(addHours(0, 20, 5)).toEqual([1, 1]);
    expect(addHours(6, 23, 1)).toEqual([0, 0]);
    expect(addHours(3, 10, 0)).toEqual([3, 10]);
  });
  it("směna od 20:00 v neděli sčítá 20–23 v neděli a 0–3 v pondělí", () => {
    let expected = 0;
    for (const [d, h] of [[6, 20], [6, 21], [6, 22], [6, 23], [0, 0], [0, 1], [0, 2], [0, 3]]) {
      const ref = referenceModel(d, h);
      expected += Math.max(...ref.scores);
    }
    expect(shiftExpectation(DEMO_PARAMS, 6, 20)).toBeCloseTo(expected, 12);
  });
});

describe("heatmapa týdne", () => {
  it("má 7 × 24 buněk a top 5 je seřazené sestupně", () => {
    const grid = weekGrid(DEMO_PARAMS);
    expect(grid).toHaveLength(7);
    grid.forEach((row) => expect(row).toHaveLength(24));
    const top = topWindows(grid, 5);
    expect(top).toHaveLength(5);
    for (let i = 1; i < top.length; i++) expect(top[i - 1].prob).toBeGreaterThanOrEqual(top[i].prob);
    const max = Math.max(...grid.flat().map((c) => c.prob));
    expect(top[0].prob).toBe(max);
  });
});

// ── Kalibrace ──────────────────────────────────────────────────────────────
const job = (i: number, travelMinutes: number, won: boolean): JobLog => ({
  id: "j" + i,
  calledAt: "2026-09-01T08:00:00.000Z",
  segmentId: "js",
  direction: null,
  standId: "A",
  travelMinutes,
  kind: i % 4 === 0 ? "breakdown" : "accident",
  result: won ? "won" : "lost",
  source: "assistance",
});

describe("kalibrace", () => {
  it("fitLogistic odhadne parametry křivky z deterministických dat", () => {
    // Váhované body přesně podle p(T) s T_half = 10, k = 3.
    const x: number[] = [];
    const y: number[] = [];
    for (let T = 0; T <= 30; T++) {
      const p = 1 / (1 + Math.exp((T - 10) / 3));
      const wins = Math.round(p * 200);
      for (let i = 0; i < 200; i++) {
        x.push(T);
        y.push(i < wins ? 1 : 0);
      }
    }
    const { b0, b1 } = fitLogistic(x, y, 0);
    expect(-1 / b1).toBeCloseTo(3, 1);
    expect(-b0 / b1).toBeCloseTo(10, 1);
  });

  it("odmítne málo dat nebo jen jeden výsledek", () => {
    expect(calibrate([job(1, 5, true)]).ok).toBe(false);
    expect(calibrate(Array.from({ length: 40 }, (_, i) => job(i, 5, true))).ok).toBe(false);
  });

  it("vrací T_half, k a podíl poruch; nová verze parametrů", () => {
    const jobs = Array.from({ length: 60 }, (_, i) => {
      const T = i % 20;
      return job(i, T, T < 10 ? i % 7 !== 0 : i % 5 === 0);
    });
    const r = calibrate(jobs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tHalf).toBeGreaterThan(5);
    expect(r.tHalf).toBeLessThan(15);
    expect(r.k).toBeGreaterThan(0);
    expect(r.preliminary).toBe(true);
    expect(r.breakdownShare).toBeCloseTo(15 / 60, 12);
    const next = withCalibration(DEMO_PARAMS, r);
    expect(next.version).toBe(DEMO_PARAMS.version + 1);
    expect(next.source).toBe("calibration");
    expect(next.capture.tHalf).toBe(r.tHalf);
  });
});

describe("export", () => {
  it("CSV má hlavičku a escapuje čárky", () => {
    const csv = jobsToCSV([{ ...job(1, 5, true), id: "a,b" }]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("id,calledAt,segmentId,direction,standId,travelMinutes,kind,result,source,entryId,lat,lng");
    expect(lines[1].startsWith('"a,b",')).toBe(true);
  });
});
