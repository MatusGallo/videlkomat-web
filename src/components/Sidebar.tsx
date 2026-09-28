import { useState } from "react";
import type { View, YearGroup } from "../types";
import { MONTHS, CURRENT_MONTH, CURRENT_YEAR } from "../constants";
import { useSettings } from "../utils/settings";
import { Logo, X, LayoutDashboard, CalendarDays, Plus, LogOut, ChevronDown, Fuel, MapPin, Truck } from "../icons";
import { logout } from "../utils/auth";

type Props = {
  view: View;
  go: (v: View, year?: number) => void;
  open: boolean;
  onClose: () => void;
  yearGroups: YearGroup[];
  onQuickAdd: () => void;
  onFuelAdd: () => void;
  onJobAdd: () => void;
};

export function Sidebar({
  view, go, open, onClose,
  yearGroups, onQuickAdd, onFuelAdd, onJobAdd,
}: Props) {
  const { settings } = useSettings();
  const [openYears, setOpenYears] = useState<Set<number>>(() => new Set([CURRENT_YEAR]));
  const toggleYear = (y: number) =>
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y);
      else next.add(y);
      return next;
    });

  return (
    <aside className={"od-side" + (open ? " is-open" : "")}>
      <div className="od-brand">
        <Logo size={30} className="od-brand-ico" />
        <span className="od-brand-name">Vydělkomat</span>
        <button className="od-side-logout" onClick={logout} title="Odhlásit se" aria-label="Odhlásit se">
          <LogOut size={18} />
        </button>
        <button className="od-side-close" onClick={onClose} aria-label="Zavřít menu">
          <X size={18} />
        </button>
      </div>

      <button className="od-quick-btn" onClick={onQuickAdd} title="Zásah (N)">
        <Plus size={16} /> Zásah <span className="od-kbd">N</span>
      </button>

      <button className="od-quick-btn od-quick-btn-fuel" onClick={onFuelAdd} title="Tankování (T)">
        <Fuel size={16} /> Tankování <span className="od-kbd">T</span>
      </button>

      <button className="od-quick-btn od-quick-btn-fuel" onClick={onJobAdd} title="Výjezd (V)">
        <Truck size={16} /> Výjezd <span className="od-kbd">V</span>
      </button>

      <nav className="od-nav">
        <button
          className={"od-nav-item" + (view === "dashboard" ? " is-active" : "")}
          onClick={() => go("dashboard")}
        >
          <LayoutDashboard size={18} /> <span>Souhrn {settings.selectedYear}</span>
        </button>
        <button
          className={"od-nav-item" + (view === "fuel" ? " is-active" : "")}
          onClick={() => go("fuel")}
        >
          <Fuel size={18} /> <span>Tankování</span>
        </button>
        <button
          className={"od-nav-item" + (view === "predict" ? " is-active" : "")}
          onClick={() => go("predict")}
        >
          <MapPin size={18} /> <span>Kde čekat</span>
        </button>
        {yearGroups.map((g) => {
          const isOpen = openYears.has(g.year);
          return (
            <div className="od-year-group" key={g.year}>
              <button
                className={"od-year-head" + (isOpen ? " is-open" : "")}
                onClick={() => toggleYear(g.year)}
                aria-expanded={isOpen}
              >
                <ChevronDown size={16} className="od-year-chev" />
                <span>Rok {g.year}</span>
              </button>
              {isOpen && (
                <div className="od-year-body">
                  {g.activeMonths.map((i) => {
                    const c = g.months[i].count;
                    return (
                      <button
                        key={i}
                        className={"od-nav-item" + (view === i && settings.selectedYear === g.year ? " is-active" : "")}
                        onClick={() => go(i, g.year)}
                      >
                        <CalendarDays size={18} /> <span>{MONTHS[i]}</span>
                        {c > 0 && <span className="od-nav-badge">{c}</span>}
                        {i === CURRENT_MONTH && g.year === CURRENT_YEAR && (
                          <span className="od-nav-dot" title="Aktuální měsíc" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <button className="od-logout" onClick={logout} title="Odhlásit se">
        <LogOut size={16} /> <span>Odhlásit</span>
      </button>

      <button className="od-side-close-bottom" onClick={onClose} aria-label="Zavřít menu">
        <X size={18} /> <span>Zavřít</span>
      </button>
    </aside>
  );
}
