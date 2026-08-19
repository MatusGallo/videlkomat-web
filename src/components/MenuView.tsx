import type { MonthStat, View } from "../types";
import { MONTHS, CURRENT_MONTH, CURRENT_YEAR } from "../constants";
import { useSettings } from "../utils/SettingsContext";
import { LayoutDashboard, CalendarDays, Fuel as FuelIcon, ChevronRight, LogOut } from "../icons";
import { logout } from "./PasswordGate";

type YearGroup = { year: number; months: MonthStat[]; activeMonths: number[] };

type Props = {
  view: View;
  go: (v: View, year?: number) => void;
  yearGroups: YearGroup[];
};

// Mobilní „Menu" stránka – celoplošná navigace ve stylu iOS seskupených seznamů.
export function MenuView({ view, go, yearGroups }: Props) {
  const { settings } = useSettings();
  return (
    <div className="od-fade od-menu">
      <div className="od-head"><h1>Menu</h1></div>

      <div className="od-menu-list">
        <button
          className={"od-menu-row" + (view === "dashboard" ? " is-active" : "")}
          onClick={() => go("dashboard")}
        >
          <LayoutDashboard size={20} />
          <span className="od-menu-row-t">Souhrn {settings.selectedYear}</span>
          <ChevronRight size={17} className="od-menu-chev" />
        </button>
        <button
          className={"od-menu-row" + (view === "fuel" ? " is-active" : "")}
          onClick={() => go("fuel")}
        >
          <FuelIcon size={20} />
          <span className="od-menu-row-t">Tankování</span>
          <ChevronRight size={17} className="od-menu-chev" />
        </button>
      </div>

      {yearGroups.map((g) => (
        <div className="od-menu-sec" key={g.year}>
          <div className="od-menu-lbl">Rok {g.year}</div>
          <div className="od-menu-list">
            {g.activeMonths.map((i) => {
              const c = g.months[i].count;
              const isActive = view === i && settings.selectedYear === g.year;
              return (
                <button
                  key={i}
                  className={"od-menu-row" + (isActive ? " is-active" : "")}
                  onClick={() => go(i, g.year)}
                >
                  <CalendarDays size={20} />
                  <span className="od-menu-row-t">{MONTHS[i]}</span>
                  {c > 0 && <span className="od-nav-badge">{c}</span>}
                  {i === CURRENT_MONTH && g.year === CURRENT_YEAR && (
                    <span className="od-nav-dot" title="Aktuální měsíc" />
                  )}
                  <ChevronRight size={17} className="od-menu-chev" />
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="od-menu-list od-menu-list-end">
        <button className="od-menu-row danger" onClick={logout}>
          <LogOut size={20} />
          <span className="od-menu-row-t">Odhlásit se</span>
        </button>
      </div>
    </div>
  );
}
