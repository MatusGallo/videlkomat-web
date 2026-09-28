# Vydělkomat

## Ukládání dat (cloud sync mezi zařízeními)

Data se ukládají do **Supabase** (Postgres) přes serverless funkci na Vercelu
([api/entries.ts](api/entries.ts)). `localStorage` slouží už jen jako offline cache —
data se tak neztratí při vyčištění prohlížeče a synchronizují se mezi zařízeními.

### Jednorázové nastavení

1. **Supabase** – vytvoř projekt na [supabase.com](https://supabase.com) (free tier).
   - V *SQL Editoru* spusť obsah [supabase/schema.sql](supabase/schema.sql).
   - V *Project Settings → API* si zkopíruj **Project URL** a **`service_role`** klíč.
2. **Vercel** – v *Project Settings → Environment Variables* přidej:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role klíč *(tajný, nikdy ne do frontendu)*
   - `APP_PASSWORD_HASH` = SHA-256 hash přístupového hesla
     *(stávající hash je `7e11bc65a7852d1c5833549ad3a1bbc743deac167c2f18ae11b7b2784dd8d00d`)*
3. Redeploy. Hotovo.

### Lokální vývoj

Čisté `npm run dev` (Vite) neumí spustit `/api` funkce. Pro test cloud syncu lokálně:
`npm i -g vercel` a pak `vercel dev` (env proměnné nastav přes `vercel env pull`).
Bez toho appka funguje dál nad lokální cache.

## Kde čekat (doporučení stanoviště)

Sekce doporučuje, kde s vozem čekat, aby byla co největší šance na zakázku:
`očekávané zakázky = poptávka na úsecích × šance, že dorazím první p(T)`.

- **Model** – čisté funkce v [src/predict/](src/predict/) (`model.ts`, `calibrate.ts`),
  testy `npm test`. Rozhraní je obecné (zóny poptávky × stanoviště × dojezd podle hodiny),
  aby šlo později přejít na H3 mřížku a routovací engine.
- **Parametry** – verzované v tabulce `predict_params` (`/api/params`); appka použije
  nejvyšší verzi, bez ní [ukázková data](src/predict/demoParams.ts) se štítkem DEMO.
  Novou verzi vytvoří úprava stanovišť, kalibrace nebo import.
- **Mapa** – Leaflet nad dlaždicemi OpenStreetMap (bez API klíče, ztmavené CSS filtrem).
  Trasy úseků jsou z OSM v `demoParams.ts` (`geo.path`), polohu stanovišť si řidič
  nastaví klepnutím do mapy v záložce Stanoviště.
- **Interaktivita** – klepnutí na úsek = detail (poptávka přes den, dojezdy), na stanoviště =
  dosah (úseky obarvené šancí dorazit první), podržení na úseku = zápis výjezdu s místem;
  časová osa pod mapou s přehráním dne; plán směny s upozorněním 15 min před přesunem /
  špičkou (notifikace běží, dokud je appka otevřená – bez push serveru).
- **Výjezdy** – tabulka `jobs` (`/api/jobs`), zapisují se v sheetu Přidat → Výjezd,
  export CSV/JSON v záložce Výjezdy.
- **Páteřní síť** (fáze 2) – Městský okruh, D0 a radiály D1/D5/D6/D7/D8/D10/D11/R4 v
  [src/predict/network.json](src/predict/network.json), generuje `npm run build:network`
  (OSM přes Overpass, dojezdy ze stanovišť přes veřejný OSRM; `-- --refresh` stáhne OSM znovu,
  `-- --no-osrm` jen odhad ze vzdálenosti). Radiály se dělí na D0: úseky uvnitř mají id `d1-01…`,
  úseky za D0 až k okraji výřezu dat `d1-x01…`, takže přidání nemění stávající id. Po přestavbě sítě
  pusťte znovu import nehod – přiřadí poptávku i novým úsekům.
  Za D0 jsou ukázková stanoviště V1–V7 (benzínky / odpočívky z OSM); starší uložené parametry je
  dostanou jednou (`demoStandsSeen`), smazaná se nevracejí.
  Vlastní / přesunutá stanoviště dostanou dojezdy odhadem z polohy.
- **Reálná data** – poptávka je z nehod Policie ČR ([src/predict/demand.json](src/predict/demand.json)).
  Aktualizace: `npm run fetch:police` (stáhne uzavřené měsíce z mapy nehod Policie ČR, šetrně a s cache)
  a `npm run import:cdv -- scripts/.police-cache/praha.csv --years 3 --bundle "Policie ČR, nehody M/RRRR–M/RRRR"`.
  V datech nejsou drobné nehody sepsané bez policie ani poruchy – absolutní čísla jsou proto nižší
  než skutečné zakázky, pořadí úseků a hodin sedí. Stanoviště jsou dál ukázková.
- **Import nehod** – `npm run import:cdv -- udalosti.csv --years 3 [--upload]`
  (CSV s časem a GPS `lat,lng` – úsek se přiřadí sám do 150 m – nebo s `zone_id`; pro silnice
  s ≥ 200 událostmi spočítá vlastní hodinový profil, viz [scripts/import-cdv.ts](scripts/import-cdv.ts)).
- **Svátky a sezóna** – import spočítá z denních počtů nehod násobky pro státní svátky, Vánoce
  (24.–26. 12.), konec roku (27. 12.–1. 1.) a měsíce ([src/predict/calendar.ts](src/predict/calendar.ts)).
  Záložky Teď a Týden počítají s konkrétními daty nejbližších 7 dnů (`withCalendar`).
- **Historie** – nehody po dnech a události na síti v [src/predict/history.json](src/predict/history.json)
  (zapisuje `import:cdv --bundle`): tento den v minulých letech, kalendář, svátky a sezóna, vlastní výjezdy.
- **Zpětný test** – `npm run backtest [-- --split 2025-09-01]`: model naučený na nehodách před datem
  porovná s tím, co se stalo potom (pořadí úseků, hodiny týdne, „Vysoká“ hodiny, pořadí stanovišť), vždy
  proti naivnímu odhadu podle délky úseku. Dojezdy tím ověřené nejsou – ty ověří až vlastní výjezdy.
- **Zápis výjezdu** – v hlavní kartě „Jedu na zakázku“ → Získáno / Předběhnut otevře zápis s časem vyjetí,
  stanovištěm, změřeným dojezdem a (se zapnutou polohou) úsekem; rozjetý výjezd přežije zavření appky.
- **Učení z výjezdů** – od 20 výjezdů appka navrhne násobky poptávky po úsecích (záložka Výjezdy).
- **Plán směny** počítá s dobou přesunu mezi stanovišti a se zapnutou polohou i s cestou z místa, kde jste; **návrh nových míst** a slepá místa jsou
  v záložce Stanoviště; **moje poloha** (GPS) jen po zapnutí, zůstává v zařízení.
- Skripty běží přes `tsx` (sdílí moduly s appkou).
- **Kalibrace** – tlačítko v appce nebo `npm run calibrate [-- --dry-run]`
  (potřebuje `SUPABASE_URL` a `SUPABASE_SERVICE_ROLE_KEY`; dá se pouštět cronem).

Po nasazení je potřeba v Supabase znovu spustit [supabase/schema.sql](supabase/schema.sql)
(přibyly tabulky `jobs` a `predict_params`).

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
