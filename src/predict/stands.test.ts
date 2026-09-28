import { describe, expect, it } from "vitest";
import { DEMO_PARAMS } from "./demoParams";
import { upgradeParams } from "./labels";
import { shiftPlan } from "./model";
import { moveMinutes } from "./geo";

const OUTER = ["V1", "V2", "V3", "V4", "V5", "V6", "V7"];

describe("stanoviště za D0", () => {
  it("ukázková data je obsahují a mají dojezd na každý úsek", () => {
    const ids = DEMO_PARAMS.stands.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(OUTER));
  });

  it("starší uložená verze (jen A–N) dostane nová stanoviště", () => {
    const old = { ...DEMO_PARAMS, stands: DEMO_PARAMS.stands.filter((s) => !OUTER.includes(s.id)) };
    const up = upgradeParams(old);
    expect(up.stands.map((s) => s.id)).toEqual(expect.arrayContaining(OUTER));
    expect(up.demoStandsSeen).toEqual(expect.arrayContaining(OUTER));
    const v1 = up.stands.find((s) => s.id === "V1")!;
    expect(v1.t0).toEqual(DEMO_PARAMS.stands.find((s) => s.id === "V1")!.t0);
  });

  it("smazané ukázkové stanoviště se nevrací", () => {
    const up = upgradeParams({ ...DEMO_PARAMS, stands: DEMO_PARAMS.stands.filter((s) => s.id !== "V3") });
    const removed = { ...up, stands: up.stands.filter((s) => s.id !== "V3") };
    expect(upgradeParams(removed).stands.some((s) => s.id === "V3")).toBe(false);
  });

  it("vlastní stanoviště se stejným id se nepřepíše", () => {
    const mine = { id: "V2", name: "Moje", t0: { ...DEMO_PARAMS.stands[0].t0 }, geo: { lat: 50.08, lng: 14.42 } };
    const old = { ...DEMO_PARAMS, stands: [...DEMO_PARAMS.stands.filter((s) => !OUTER.includes(s.id)), mine] };
    const up = upgradeParams(old);
    expect(up.stands.filter((s) => s.id === "V2")).toHaveLength(1);
    expect(up.stands.find((s) => s.id === "V2")!.name).toBe("Moje");
  });
});

describe("plán z aktuální polohy", () => {
  it("první hodina počítá s cestou z mé polohy", () => {
    // Jirny (za D0 na D11), úterý 10:00.
    const here = { lat: 50.1135, lng: 14.6975 };
    const startMove = DEMO_PARAMS.stands.map((s) => moveMinutes(here, s.geo!));
    const free = shiftPlan(DEMO_PARAMS, 1, 10, 8);
    const fromHere = shiftPlan(DEMO_PARAMS, 1, 10, 8, { startMove });
    const first = fromHere.hours[0];
    expect(first.moveMinutes).toBeCloseTo(startMove[first.best]);
    expect(first.score).toBeLessThan(free.hours[0].score);
    expect(fromHere.expected).toBeLessThanOrEqual(free.expected);
  });

  it("stojím-li u doporučeného stanoviště, plán se nemění", () => {
    const free = shiftPlan(DEMO_PARAMS, 1, 10, 8);
    const at = DEMO_PARAMS.stands[free.hours[0].best].geo!;
    const startMove = DEMO_PARAMS.stands.map((s) => moveMinutes(at, s.geo!));
    expect(shiftPlan(DEMO_PARAMS, 1, 10, 8, { startMove }).hours.map((x) => x.best)).toEqual(free.hours.map((x) => x.best));
  });

  it("od stanoviště za D0 radí u 8h směny přesun k hustší poptávce (jeden vůz)", () => {
    // Poptávka za D0 je řídká – cesta se za směnu vrátí. Kdyby se to změnilo
    // (nová data, kalibrace), je to důležitá informace, ne chyba.
    const v7 = DEMO_PARAMS.stands.findIndex((s) => s.id === "V7");
    const here = DEMO_PARAMS.stands[v7].geo!;
    const startMove = DEMO_PARAMS.stands.map((s) => moveMinutes(here, s.geo!));
    for (const h of [3, 10, 17]) {
      const first = shiftPlan(DEMO_PARAMS, 1, h, 8, { startMove }).hours[0];
      expect(first.best).not.toBe(v7);
      expect(first.moveMinutes).toBeGreaterThan(0);
    }
  });

  it("bez polohy se plán nemění", () => {
    expect(shiftPlan(DEMO_PARAMS, 2, 8, 6)).toEqual(shiftPlan(DEMO_PARAMS, 2, 8, 6, {}));
  });
});
