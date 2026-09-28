import { tableHandler } from "./_lib.js";

// Verzované parametry modelu „Kde čekat". Každá změna (import, kalibrace,
// úprava stanovišť) je nový řádek – starší verze zůstávají pro dohledání.
export default tableHandler({
  table: "predict_params",
  columns: "id,version,data",
  order: "version.asc",
  fromRow: (r) => ({ id: String(r.id), params: r.data }),
  toRow: (b) => {
    const params = b.params as { version?: unknown; source?: unknown } | undefined;
    return {
      id: String(b.id),
      version: Number(params?.version ?? 0),
      source: String(params?.source ?? "user"),
      data: params ?? {},
    };
  },
});
