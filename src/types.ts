export type Entry = {
  id: string;
  m: number;
  date: string;
  amount: number;
};

// Tankování: celková natankovaná suma; z ní si beru jako svůj náklad 30 %.
// Litry jsou nepovinné (slouží k dopočtu ceny za litr).
export type Fuel = {
  id: string;
  m: number;
  date: string;
  amount: number;
  liters?: number | null;
};

export type MonthStat = {
  total: number;
  profit: number;
  fuelTotal: number;
  fuelCost: number;
  count: number;
  days: number;
  avgAmount: number;
  avgProfit: number;
  avgProfitPerDay: number;
};

export type YearStat = {
  total: number;
  profit: number;
  fuelTotal: number;
  fuelCost: number;
  count: number;
  days: number;
  avgProfitPerDay: number;
};

export type Stats = {
  months: MonthStat[];
  year: YearStat;
};

export type View = "dashboard" | "fuel" | "menu" | number;

export type MoMChange = { pct: number; up: boolean } | null;

export type TrendMode = "days" | "months" | "years";

export type TrendPoint = {
  label: string;
  fullLabel: string;
  total: number;
  profit: number;
  count: number;
  isCurrent?: boolean;
};
