// Datový model predikce „kde čekat". Nic z toho není natvrdo v UI – aplikace
// čte ModelParams (demo, import z CDV, kalibrace, úpravy uživatele).
//
// Obecné rozhraní pro další fáze:
//   zóny poptávky (fáze 1: úseky, fáze 3: H3 buňky) × stanoviště × dojezd(d, h).

// Zóna poptávky. Ve fázi 1 úsek koridoru, později buňka mřížky / úsek z OSM.
export type DemandZone = {
  id: string;
  name: string;
  // Silnice, ke které úsek patří (MO, D0, D1…) – seskupení v seznamech.
  road?: string;
  // A_s – roční počet událostí vhodných pro odtah (nehody + poruchy).
  annual: number;
  // W_s – přirážka (uzavírka, zúžení…).
  weight: number;
  // Naučený násobek poptávky z vlastních výjezdů (kalibrace po úsecích), výchozí 1.
  learn?: number;
  // Vlastní hodinový profil (import dat po silnicích); bez něj platí společný.
  profiles?: { weekday: number[]; weekend: number[] };
  // Poloha ve schématu koridoru (0–1). Ve fázi 3 nahradí souřadnice / H3 index.
  schema?: { from: number; to: number };
  // Trasa na mapě [lat, lng] (fáze 1: osa úseku z OpenStreetMap).
  geo?: { path: [number, number][] };
};

export type GeoPoint = { lat: number; lng: number };

// Místo, kde se dá legálně a dlouhodobě stát a čekat na zakázku.
export type Stand = {
  id: string;
  name: string;
  // T0(j, s) – dojezd na zónu ve volném provozu [min], klíč = DemandZone.id.
  // Musí zahrnovat směr jízdy a otočení na nejbližším sjezdu.
  t0: Record<string, number>;
  schema?: { x: number };
  // Poloha na mapě.
  geo?: GeoPoint;
};

// Aktivní uzavírka / zúžení – informace pro řidiče (přirážka je ve weight).
export type ZoneAlert = { zoneId: string; label: string; until: string };

export type ParamsSource = "demo" | "import" | "calibration" | "user";

export type ModelParams = {
  version: number;
  createdAt: string;
  source: ParamsSource;
  // Dokud je true, UI ukazuje štítek „DEMO · modelová data".
  isDemo: boolean;
  // Odkud je poptávka (např. „Policie ČR, nehody 9/2023–8/2026") – popisek v UI.
  dataSource?: string;
  zones: DemandZone[];
  stands: Stand[];
  // Hodinové profily poptávky (24 hodnot, normalizují se na součet 1).
  profiles: { weekday: number[]; weekend: number[] };
  // DF[d] – koeficient dne v týdnu, 0 = Po … 6 = Ne.
  dayFactor: number[];
  // Kongesce 0–1 podle hodiny; o víkendu × weekendCongestion.
  congestion: number[];
  weekendCongestion: number;
  // T = T0 × (1 + congestionImpact × kongesce)
  congestionImpact: number;
  // p(T) = 1 / (1 + exp((T − tHalf) / k))
  capture: { tHalf: number; k: number };
  alerts: ZoneAlert[];
  // Ukázková stanoviště, která už tato verze viděla – nová se doplní, smazaná
  // uživatelem se nevrací. Starší verze bez pole znaly jen A–N.
  demoStandsSeen?: string[];
  // Svátky a sezóna z historie nehod (import). Bez nich se počítá jen den v týdnu.
  calendar?: CalendarFactors;
  // Násobek poptávky po dnech v týdnu pro konkrétní týden (withCalendar).
  // Jen za běhu – neukládá se.
  dateScale?: number[];
};

// Násobky poptávky proti běžnému dni stejného dne v týdnu.
export type CalendarFactors = {
  // 12 měsíců (leden = 0); normalizované tak, aby roční součet seděl na annual.
  month: number[];
  // Státní svátek mimo Vánoce a konec roku.
  holiday: number;
  // 24.–26. 12.
  christmas: number;
  // 27. 12.–1. 1.
  yearEnd: number;
};

// Matice dojezdů podle hodiny. Fáze 1: T0 × kongesce, později routovací engine.
export type TravelFn = (params: ModelParams, stand: Stand, zone: DemandZone, d: number, h: number) => number;

export type Evaluation = {
  // λ(s, d, h) po zónách, ve stejném pořadí jako params.zones.
  lam: number[];
  // skóre(j, d, h) po stanovištích, ve stejném pořadí jako params.stands.
  scores: number[];
  // Index stanoviště s nejvyšším skóre (−1, když žádné není).
  best: number;
};

// Záznam výjezdu – vlastní data pro kalibraci.
export type JobDirection = "to_center" | "from_center";
export type JobKind = "accident" | "breakdown";
export type JobResult = "won" | "lost";
export type JobSource = "assistance" | "driver" | "police" | "other";

export type JobLog = {
  id: string;
  calledAt: string; // ISO datetime
  segmentId: string;
  direction: JobDirection | null;
  standId: string; // odkud vyjel
  travelMinutes: number;
  kind: JobKind;
  result: JobResult;
  source: JobSource;
  // Získaná zakázka zapsaná zároveň jako Zásah (Entry.id).
  entryId?: string | null;
  // Místo zakázky (zápis podržením na mapě). Bez něj se výjezd kreslí na svůj úsek.
  lat?: number | null;
  lng?: number | null;
};
