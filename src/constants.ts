export const MONTHS = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
];

export const MONTHS_SHORT = [
  "Led", "Úno", "Bře", "Dub", "Kvě", "Čvn",
  "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro",
];

export const STORAGE_KEY = "odtah_zaznamy_v1";
export const FUEL_STORAGE_KEY = "odtah_tankovani_v1";
export const JOBS_STORAGE_KEY = "odtah_vyjezdy_v1";
export const PARAMS_STORAGE_KEY = "odtah_model_params_v1";

// Běžné kalendářní měsíce (1.–poslední den měsíce).
const _today = new Date();
export const CURRENT_YEAR = _today.getFullYear();
export const CURRENT_MONTH = _today.getMonth();
export const PROFIT_RATE = 0.3;
export const PROFIT_PCT = Math.round(PROFIT_RATE * 100);
// Z natankované sumy si beru jako svůj náklad 30 %.
export const FUEL_COST_RATE = 0.3;
export const FUEL_COST_PCT = Math.round(FUEL_COST_RATE * 100);
export const VAT_RATE = 0.21;
export const VAT_PCT = Math.round(VAT_RATE * 100);
// Kolik posledních tankování ukazuje dashboard.
export const FUEL_RECORDS_LIMIT = 10;
