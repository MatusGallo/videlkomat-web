import { tableHandler } from "./_lib.js";

const base = (f: Record<string, unknown>) => ({
  id: String(f.id),
  m: Number(f.m),
  date: String(f.date),
  amount: Number(f.amount),
});

export default tableHandler({
  table: "fuel",
  columns: "id,m,date,amount,liters",
  fromRow: (f) => ({ ...base(f), liters: f.liters == null ? null : Number(f.liters) }),
  toRow: (f) => ({ ...base(f), liters: f.liters == null || f.liters === "" ? null : Number(f.liters) }),
});
