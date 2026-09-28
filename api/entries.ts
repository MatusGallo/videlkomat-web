import { tableHandler } from "./_lib.js";

const row = (e: Record<string, unknown>) => ({
  id: String(e.id),
  m: Number(e.m),
  date: String(e.date),
  amount: Number(e.amount),
});

export default tableHandler({
  table: "entries",
  columns: "id,m,date,amount",
  fromRow: row,
  toRow: row,
});
