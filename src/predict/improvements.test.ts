import { describe, expect, it } from "vitest";
import { DEMO_PARAMS, ESTIMATE_PARAMS } from "./demoParams";
import { upgradeParams } from "./labels";
import demand from "./demand.json";
import { CORRIDOR_PARAMS } from "./corridorParams";
import { evaluate, hourShare, weekGrid, zoneDemand } from "./model";
import { LEARN_MIN, withZoneLearning, zoneLearning } from "./calibrate";
import { blindZones, suggestStands } from "./suggest";
import { distanceKm, moveMinutes, pathLengthKm, pointToPathKm } from "./geo";
import type { JobLog } from "./types";

describe("geo", () => {
  const path: [number, number][] = [[50, 14], [50, 14.1]];
  it("vzdálenost bodu od čáry", () => {
    expect(pointToPathKm({ lat: 50, lng: 14.05 }, path)).toBeCloseTo(0, 6);
    // 0,01° zeměpisné šířky ≈ 1,1 km
    expect(pointToPathKm({ lat: 50.01, lng: 14.05 }, path)).toBeCloseTo(1.106, 1);
    // za koncem čáry se měří ke koncovému bodu
    expect(pointToPathKm({ lat: 50, lng: 14.2 }, path)).toBeCloseTo(pathLengthKm([[50, 14.1], [50, 14.2]]), 1);
  });
  it("přesun mezi stanovišti: stejné místo 0, dál víc", () => {
    const a = { lat: 50.05, lng: 14.45 };
    expect(moveMinutes(a, a)).toBe(0);
    expect(moveMinutes(a, { lat: 50.1, lng: 14.45 })).toBeGreaterThan(moveMinutes(a, { lat: 50.07, lng: 14.45 }));
  });
});

describe("srovnaná poptávka koridoru", () => {
  it("koridor v odhadnuté síti má poptávku podle délky, referenční koridor zůstává", () => {
    const js = ESTIMATE_PARAMS.zones.find((z) => z.id === "js")!;
    expect(js.annual).toBe(Math.round(pathLengthKm(js.geo!.path) * 60));
    expect(CORRIDOR_PARAMS.zones.find((z) => z.id === "js")!.annual).toBe(260);
  });
});

describe("reálná poptávka (Policie ČR)", () => {
  it("výchozí parametry nejsou demo a součet poptávky odpovídá počtu nehod za rok", () => {
    expect(DEMO_PARAMS.isDemo).toBe(false);
    expect(DEMO_PARAMS.dataSource).toBe(demand.source);
    const sum = DEMO_PARAMS.zones.reduce((s, z) => s + z.annual, 0);
    expect(sum).toBeCloseTo(demand.events / demand.years, 0);
    expect(DEMO_PARAMS.profiles.weekday.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    expect(DEMO_PARAMS.dayFactor).toHaveLength(7);
  });
  it("starší uložená verze s odhadem převezme reálnou poptávku, stanoviště a učení zůstanou", () => {
    const saved = {
      ...ESTIMATE_PARAMS,
      version: 5,
      source: "user" as const,
      stands: ESTIMATE_PARAMS.stands.slice(0, 2),
      zones: ESTIMATE_PARAMS.zones.map((z) => (z.id === "js" ? { ...z, learn: 1.7 } : z)),
      capture: { tHalf: 10, k: 2 },
    };
    const up = upgradeParams(saved, DEMO_PARAMS);
    expect(up.isDemo).toBe(false);
    expect(up.dataSource).toBe(DEMO_PARAMS.dataSource);
    // Vlastní dvě zůstanou, přibudou jen nová ukázková stanoviště za D0 (V1…).
    expect(up.stands.filter((s) => !s.id.startsWith("V"))).toHaveLength(2);
    expect(up.capture.tHalf).toBe(10);
    const js = up.zones.find((z) => z.id === "js")!;
    expect(js.learn).toBe(1.7);
    expect(js.annual).toBe(DEMO_PARAMS.zones.find((z) => z.id === "js")!.annual);
    // vlastní import se nepřepisuje
    const own = upgradeParams({ ...saved, source: "import", dataSource: "moje data" }, DEMO_PARAMS);
    expect(own.dataSource).toBe("moje data");
  });
});

describe("vlastní profil úseku", () => {
  it("úsek s vlastním profilem má jinou špičku, součet dne zůstává", () => {
    const flat = new Array(24).fill(1);
    const night = flat.map((_, h) => (h < 6 ? 10 : 1));
    const P = { ...CORRIDOR_PARAMS, zones: CORRIDOR_PARAMS.zones.map((z, i) => (i === 0 ? { ...z, profiles: { weekday: night, weekend: flat } } : z)) };
    const z0 = P.zones[0];
    expect(hourShare(P, 1, 2, z0)).toBeGreaterThan(hourShare(P, 1, 2));
    const day = Array.from({ length: 24 }, (_, h) => zoneDemand(P, z0, 1, h)).reduce((a, b) => a + b, 0);
    const dayRef = Array.from({ length: 24 }, (_, h) => zoneDemand(CORRIDOR_PARAMS, CORRIDOR_PARAMS.zones[0], 1, h)).reduce((a, b) => a + b, 0);
    expect(day).toBeCloseTo(dayRef, 12);
  });
});

describe("učení poptávky z výjezdů", () => {
  const mk = (i: number, zone: string, hour = 8): JobLog => ({
    id: "j" + i,
    calledAt: new Date(2026, 8, 21 + (i % 5), hour, 10).toISOString(),
    segmentId: zone,
    direction: null,
    standId: "A",
    travelMinutes: 6,
    kind: "accident",
    result: "won",
    source: "assistance",
  });
  it("odmítne málo dat", () => {
    expect(zoneLearning(CORRIDOR_PARAMS, [mk(1, "js")]).ok).toBe(false);
  });
  it("úsek s víc výjezdy, než model čeká, dostane násobek > 1 a ostatní < 1", () => {
    const jobs = Array.from({ length: 40 }, (_, i) => mk(i, "d0"));
    const r = zoneLearning(CORRIDOR_PARAMS, jobs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const by = Object.fromEntries(r.zones.map((z) => [z.zoneId, z]));
    expect(by.d0.observed).toBe(40);
    expect(by.d0.factor).toBeGreaterThan(1);
    expect(by.js.factor).toBeLessThan(1);
    expect(r.zones.reduce((s, z) => s + z.expected, 0)).toBeCloseTo(40, 9);
    const next = withZoneLearning(CORRIDOR_PARAMS, r);
    expect(next.version).toBe(CORRIDOR_PARAMS.version + 1);
    expect(next.zones.find((z) => z.id === "d0")!.learn).toBe(by.d0.factor);
    // opakované učení se nesčítá
    const again = zoneLearning(next, jobs);
    expect(again.ok && again.zones.find((z) => z.zoneId === "d0")!.factor).toBeCloseTo(by.d0.factor, 12);
    expect(evaluate(next, 1, 8).lam[3]).toBeGreaterThan(evaluate(CORRIDOR_PARAMS, 1, 8).lam[3]);
  });
  it(`LEARN_MIN je rozumný práh`, () => expect(LEARN_MIN).toBeGreaterThanOrEqual(10));
});

describe("návrh nových stanovišť", () => {
  it("vrací 3 místa seřazená podle zakázek za týden, s rozestupem a mimo stávající", () => {
    const s = suggestStands(DEMO_PARAMS, 3);
    expect(s).toHaveLength(3);
    for (let i = 1; i < s.length; i++) expect(s[i].weekly).toBeLessThanOrEqual(s[i - 1].weekly + 1e-9);
    for (const x of s) {
      expect(x.weekly).toBeGreaterThan(0);
      expect(x.gainPerWeek).toBeGreaterThanOrEqual(0);
      expect(Object.keys(x.t0).length).toBe(DEMO_PARAMS.zones.length);
      for (const st of DEMO_PARAMS.stands) if (st.geo) expect(distanceKm(st.geo, x.pos)).toBeGreaterThanOrEqual(1);
    }
    for (let i = 0; i < s.length; i++)
      for (let j = i + 1; j < s.length; j++) expect(distanceKm(s[i].pos, s[j].pos)).toBeGreaterThanOrEqual(2.5);
  });
  it("bez stanovišť je zisk = týdenní výnos místa", () => {
    const [x] = suggestStands({ ...DEMO_PARAMS, stands: [] }, 1);
    expect(x.gainPerWeek).toBeCloseTo(x.weekly, 9);
  });
  it("přidání navrženého stanoviště týdenní výnos opravdu zvedne", () => {
    const [top] = suggestStands(DEMO_PARAMS, 1);
    const sum = (p: typeof DEMO_PARAMS) => weekGrid(p).flat().reduce((a, c) => a + -Math.log(1 - c.prob), 0);
    const withNew = { ...DEMO_PARAMS, stands: [...DEMO_PARAMS.stands, { id: "Z", name: "Návrh", t0: top.t0, geo: top.pos }] };
    expect(sum(withNew) - sum(DEMO_PARAMS)).toBeCloseTo(top.gainPerWeek, 6);
  });
  it("slepá místa: bez stanovišť jsou slepé všechny úseky", () => {
    expect(blindZones({ ...CORRIDOR_PARAMS, stands: [] })).toHaveLength(CORRIDOR_PARAMS.zones.length);
    expect(blindZones(CORRIDOR_PARAMS)).toHaveLength(0);
  });
});
