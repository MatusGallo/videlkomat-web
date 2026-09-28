const NBSP = " ";

export const czk = (n: number): string =>
  new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .format(Math.round((n + Number.EPSILON) * 100) / 100) + NBSP + "Kč";

export const num1 = (n: number): string =>
  new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(n);

export const kfmt = (n: number): string =>
  n >= 1000 ? num1(n / 1000) + "k" : String(Math.round(n));

export const dateLabel = (iso: string): string => {
  const p = iso.split("-");
  return parseInt(p[2], 10) + ". " + parseInt(p[1], 10) + ".";
};

export const parseAmount = (s: string): number | null => {
  const n = parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
};

export const groupAmount = (str: string): string => {
  let s = String(str).replace(/\s/g, "").replace(/\./g, ",").replace(/[^0-9,]/g, "");
  const i = s.indexOf(",");
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, "");
  const parts = s.split(",");
  const intp = (parts[0] || "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return parts.length > 1 ? intp + "," + parts[1].slice(0, 2) : intp;
};

export const weekdayLabel = (iso: string): string =>
  new Intl.DateTimeFormat("cs-CZ", { weekday: "long" }).format(new Date(iso + "T00:00:00"));

export const plural = (n: number, one: string, few: string, many: string): string =>
  n === 1 ? one : n >= 2 && n <= 4 ? few : many;

// Lokální datum → "yyyy-mm-dd" (bez posunu do UTC jako u toISOString).
export const isoOf = (d: Date): string =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

export const todayISO = (): string => isoOf(new Date());

export const isISODate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Číslo → text do inputu v českém formátu ("3500.5" → "3 500,5").
export const toInputAmount = (n: number): string => groupAmount(String(n).replace(".", ","));

// Řazení záznamů od nejnovějšího data.
export const byDateDesc = (a: { date: string }, b: { date: string }): number =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : 0;

export const uid = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
