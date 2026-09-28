import { describe, expect, it } from "vitest";
import { DEMO_PARAMS } from "./demoParams";
import { CORRIDOR_PARAMS } from "./corridorParams";
import network from "./network.json";
import { upgradeParams } from "./labels";
import { estimateT0 } from "./geo";
import { evaluate, weekGrid } from "./model";

describe("páteřní síť (demo)", () => {
  it("obsahuje koridor i síť s jedinečnými id a trasami", () => {
    const ids = DEMO_PARAMS.zones.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(CORRIDOR_PARAMS.zones.map((z) => z.id)));
    expect(DEMO_PARAMS.zones.length).toBeGreaterThan(30);
    for (const z of DEMO_PARAMS.zones) {
      expect(z.geo?.path.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(z.road).toBeTruthy();
      expect(z.annual).toBeGreaterThan(0);
    }
  });
  it("každé stanoviště má dojezd na každý úsek", () => {
    const stIds = DEMO_PARAMS.stands.map((s) => s.id);
    expect(new Set(stIds).size).toBe(stIds.length);
    for (const s of DEMO_PARAMS.stands) {
      expect(s.geo).toBeTruthy();
      for (const z of DEMO_PARAMS.zones) expect(s.t0[z.id], `${s.id} → ${z.id}`).toBeGreaterThan(0);
    }
  });
  it("stanoviště koridoru mají dojezdy z OSRM i na koridor (stejné měřítko jako ostatní)", () => {
    for (const s of CORRIDOR_PARAMS.stands) {
      const net = DEMO_PARAMS.stands.find((x) => x.id === s.id)!;
      for (const z of Object.keys(s.t0)) expect(net.t0[z]).toBe(network.corridorStandT0[s.id as keyof typeof network.corridorStandT0][z as "js"]);
    }
  });
  it("model nad celou sítí počítá konečná čísla", () => {
    const ev = evaluate(DEMO_PARAMS, 4, 17);
    expect(ev.scores.every(Number.isFinite)).toBe(true);
    expect(ev.best).toBeGreaterThanOrEqual(0);
    expect(weekGrid(DEMO_PARAMS).flat().every((c) => c.prob > 0 && c.prob < 1)).toBe(true);
  });
});

describe("upgrade starších parametrů", () => {
  it("doplní úseky sítě a dojezdy, uživatelské hodnoty nechá", () => {
    // Uložená verze z fáze 1: jen koridor, uživatel změnil název a jeden dojezd.
    const saved = {
      ...CORRIDOR_PARAMS,
      version: 3,
      source: "user" as const,
      stands: CORRIDOR_PARAMS.stands.map((s) => (s.id === "A" ? { ...s, name: "Moje místo", t0: { ...s.t0, js: 7 } } : s)),
    };
    const up = upgradeParams(saved, DEMO_PARAMS);
    expect(up.version).toBe(3);
    expect(up.zones.length).toBe(DEMO_PARAMS.zones.length);
    const a = up.stands.find((s) => s.id === "A")!;
    expect(a.name).toBe("Moje místo");
    expect(a.t0.js).toBe(7);
    const demoA = DEMO_PARAMS.stands.find((s) => s.id === "A")!;
    expect(a.t0["mo-01"]).toBe(demoA.t0["mo-01"]); // stejné místo → dojezd z OSRM
    // Stará demo stanoviště (A–N) nevnucujeme, doplní se jen nová za D0 (V1…).
    expect(up.stands.filter((s) => !s.id.startsWith("V")).length).toBe(CORRIDOR_PARAMS.stands.length);
  });
  it("přesunuté nebo vlastní stanoviště dostane odhad z polohy", () => {
    const saved = {
      ...CORRIDOR_PARAMS,
      version: 4,
      stands: [{ id: "X", name: "Vlastní", t0: { js: 5 }, geo: { lat: 50.05, lng: 14.44 } }],
    };
    const up = upgradeParams(saved, DEMO_PARAMS);
    const x = up.stands[0];
    expect(x.t0.js).toBe(5);
    for (const z of up.zones) expect(x.t0[z.id]).toBeGreaterThan(0);
  });
  it("odhad dojezdu roste se vzdáleností", () => {
    const path: [number, number][] = [[50.08, 14.42], [50.09, 14.43]];
    const near = estimateT0({ lat: 50.085, lng: 14.425 }, path)!;
    const far = estimateT0({ lat: 50.0, lng: 14.6 }, path)!;
    expect(near).toBeGreaterThanOrEqual(2);
    expect(far).toBeGreaterThan(near);
  });
});
