-- Tabulka pro záznamy. Spusť v Supabase → SQL Editor.
create table if not exists public.entries (
  id         text primary key,
  m          int2  not null,
  date       text  not null,
  amount     numeric not null,
  updated_at timestamptz not null default now()
);

-- Zapni RLS a nepřidávej žádné public policies:
-- tabulka tak zůstane zvenčí nepřístupná. Čte/zapisuje do ní
-- výhradně serverless funkce /api/entries přes service_role klíč.
alter table public.entries enable row level security;

-- Při vypnutém "Automatically expose new tables" nemá service_role
-- automaticky práva na nové tabulky. Náš backend (secret klíč = service_role)
-- je proto potřebuje udělit ručně. Anon/authenticated nedostávají nic,
-- takže veřejný přístup zůstává díky RLS zablokovaný.
grant select, insert, update, delete on table public.entries to service_role;

-- Tabulka pro tankování. Celková natankovaná suma; můj náklad = 30 % z ní.
-- Litry jsou nepovinné (dopočet ceny za litr).
create table if not exists public.fuel (
  id         text primary key,
  m          int2  not null,
  date       text  not null,
  amount     numeric not null,
  liters     numeric,
  updated_at timestamptz not null default now()
);

alter table public.fuel enable row level security;
grant select, insert, update, delete on table public.fuel to service_role;

-- ── Kde čekat (prediktivní model stanovišť) ─────────────────────────────
-- Záznamy výjezdů – vlastní data pro kalibraci křivky p(T).
create table if not exists public.jobs (
  id             text primary key,
  called_at      text    not null,           -- ISO datetime
  segment_id     text    not null,
  direction      text,                       -- to_center | from_center | null
  stand_id       text    not null,
  travel_minutes numeric not null,
  kind           text    not null,           -- accident | breakdown
  result         text    not null,           -- won | lost
  source         text    not null,           -- assistance | driver | police | other
  entry_id       text,                       -- navázaný zásah (entries.id), když získáno
  lat            numeric,                    -- místo zakázky (nepovinné)
  lng            numeric,
  updated_at     timestamptz not null default now()
);

-- Pro tabulku vytvořenou před přidáním polohy:
alter table public.jobs add column if not exists lat numeric;
alter table public.jobs add column if not exists lng numeric;

alter table public.jobs enable row level security;
grant select, insert, update, delete on table public.jobs to service_role;

-- Verzované parametry modelu (demo → import CDV → kalibrace / úpravy stanovišť).
-- Aplikace používá řádek s nejvyšší verzí.
create table if not exists public.predict_params (
  id         text primary key,
  version    int4  not null,
  source     text  not null,                 -- demo | import | calibration | user
  data       jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.predict_params enable row level security;
grant select, insert, update, delete on table public.predict_params to service_role;
