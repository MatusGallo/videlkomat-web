import type { Entry, Fuel, Stats, MonthStat, MoMChange } from "../types";
import { CURRENT_YEAR, CURRENT_MONTH, PROFIT_RATE, FUEL_COST_RATE } from "../constants";

// Zápis patří do kalendářního měsíce svého data (celý měsíc, 1.–poslední den).
// Vrací { y, m } – rok a 0-based index měsíce.
export function periodOf(iso: string): { y: number; m: number } {
  return { y: parseInt(iso.slice(0, 4), 10), m: parseInt(iso.slice(5, 7), 10) - 1 };
}

export function computeStats(entries: Entry[], fuels: Fuel[], year: number): Stats {
  // Jeden průchod: každý zápis roztřídíme do jeho kalendářního měsíce.
  const buckets: Entry[][] = Array.from({ length: 12 }, () => []);
  for (const e of entries) {
    const p = periodOf(e.date);
    if (p.y === year) buckets[p.m].push(e);
  }
  // Natankovaná suma po měsících (v rámci roku).
  const fuelByMonth = Array.from({ length: 12 }, () => 0);
  for (const f of fuels) {
    const p = periodOf(f.date);
    if (p.y === year) fuelByMonth[p.m] += f.amount;
  }
  const months: MonthStat[] = buckets.map((list, mi) => {
    const total = list.reduce((s, e) => s + e.amount, 0);
    const count = list.length;
    const profit = total * PROFIT_RATE;
    const fuelTotal = fuelByMonth[mi];
    const fuelCost = fuelTotal * FUEL_COST_RATE;
    const days = new Set(list.map((e) => e.date)).size;
    return {
      total,
      profit,
      fuelTotal,
      fuelCost,
      count,
      days,
      avgAmount: count ? total / count : 0,
      avgProfit: count ? profit / count : 0,
      avgProfitPerDay: days ? profit / days : 0,
    };
  });
  const total = months.reduce((s, m) => s + m.total, 0);
  const count = months.reduce((s, m) => s + m.count, 0);
  const days = new Set(buckets.flatMap((list) => list.map((e) => e.date))).size;
  const profit = total * PROFIT_RATE;
  const fuelTotal = fuelByMonth.reduce((s, v) => s + v, 0);
  const fuelCost = fuelTotal * FUEL_COST_RATE;
  return {
    months,
    year: {
      total,
      profit,
      fuelTotal,
      fuelCost,
      count,
      days,
      avgProfitPerDay: days ? profit / days : 0,
    },
  };
}

export function availableYears(entries: Entry[], fuels: Fuel[]): number[] {
  const set = new Set<number>();
  entries.forEach((e) => set.add(periodOf(e.date).y));
  fuels.forEach((f) => set.add(periodOf(f.date).y));
  set.add(CURRENT_YEAR);
  return Array.from(set).sort((a, b) => b - a);
}

export function activeMonthsOf(months: MonthStat[], year: number): number[] {
  const idx: number[] = [];
  months.forEach((m, i) => {
    if (m.count > 0) idx.push(i);
  });
  if (year === CURRENT_YEAR && !idx.includes(CURRENT_MONTH)) idx.push(CURRENT_MONTH);
  idx.sort((a, b) => a - b);
  return idx.length ? idx : [CURRENT_MONTH];
}

export function dayStat(
  entries: Entry[],
  today: string,
): { total: number; prev: number; prevDate: string | null; change: MoMChange } {
  const byDate = new Map<string, number>();
  entries.forEach((e) => byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.amount));
  const total = byDate.get(today) ?? 0;
  const prevDates = Array.from(byDate.keys()).filter((d) => d < today).sort();
  const prevDate = prevDates.length ? prevDates[prevDates.length - 1] : null;
  const prev = prevDate ? byDate.get(prevDate) ?? 0 : 0;
  const change: MoMChange = prev ? { pct: ((total - prev) / prev) * 100, up: total >= prev } : null;
  return { total, prev, prevDate, change };
}

// Porovnání vybraného měsíce s předchozím měsícem (v rámci roku).
export function monthChange(months: MonthStat[], mi: number, sel: (m: MonthStat) => number): MoMChange {
  const prev = mi > 0 ? months[mi - 1] : undefined;
  if (!prev || prev.count === 0) return null;
  const cur = sel(months[mi]);
  const prevV = sel(prev);
  if (!prevV) return null;
  return { pct: ((cur - prevV) / prevV) * 100, up: cur >= prevV };
}

export function niceCeil(n: number): number {
  if (n <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / mag;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * mag;
}
