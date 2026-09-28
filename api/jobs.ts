import { tableHandler } from "./_lib.js";

// Záznamy výjezdů (kalibrace modelu „Kde čekat"). DB má snake_case sloupce.
const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const numOrNull = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export default tableHandler({
  table: "jobs",
  columns: "id,called_at,segment_id,direction,stand_id,travel_minutes,kind,result,source,entry_id,lat,lng",
  order: "called_at.asc",
  fromRow: (r) => ({
    id: String(r.id),
    calledAt: String(r.called_at),
    segmentId: String(r.segment_id),
    direction: str(r.direction),
    standId: String(r.stand_id),
    travelMinutes: Number(r.travel_minutes),
    kind: String(r.kind),
    result: String(r.result),
    source: String(r.source),
    entryId: str(r.entry_id),
    lat: numOrNull(r.lat),
    lng: numOrNull(r.lng),
  }),
  toRow: (j) => ({
    id: String(j.id),
    called_at: String(j.calledAt),
    segment_id: String(j.segmentId),
    direction: str(j.direction),
    stand_id: String(j.standId),
    travel_minutes: Number(j.travelMinutes),
    kind: String(j.kind),
    result: String(j.result),
    source: String(j.source),
    entry_id: str(j.entryId),
    lat: numOrNull(j.lat),
    lng: numOrNull(j.lng),
  }),
});
