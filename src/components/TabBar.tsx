import type { View } from "../types";
import { LayoutDashboard, Fuel as FuelIcon, MapPin, Plus, Menu, X } from "../icons";

type Props = {
  view: View;
  onGo: (v: View) => void;
  onAdd: () => void;
  onMenu: () => void;
};

// iOS chrome (jen mobil/tablet, viz CSS):
// – vpravo nahoře: Menu (přepínač; na stránce Menu se ikona animovaně změní na ×)
// – dole pill: Souhrn · Tankování · Kde čekat
// – vpravo dole: samostatná akce Přidat (zásah; na Kde čekat výjezd)
export function TabBar({ view, onGo, onAdd, onMenu }: Props) {
  const menuOpen = view === "menu";
  return (
    <>
      <button
        className={"od-topnav-btn" + (menuOpen ? " is-active" : "")}
        onClick={onMenu}
        aria-label={menuOpen ? "Zavřít menu" : "Menu"}
        title={menuOpen ? "Zavřít" : "Menu"}
      >
        <span className="od-topnav-ico">
          <Menu size={20} className="ico-menu" />
          <X size={20} className="ico-x" />
        </span>
      </button>
      <nav className={"od-tabbar" + (menuOpen ? " is-hidden" : "")} aria-label="Hlavní navigace">
        <button
          className={"od-tab" + (view === "dashboard" ? " is-active" : "")}
          onClick={() => onGo("dashboard")}
        >
          <LayoutDashboard size={22} />
          <span>Souhrn</span>
        </button>
        <button
          className={"od-tab" + (view === "fuel" ? " is-active" : "")}
          onClick={() => onGo("fuel")}
        >
          <FuelIcon size={22} />
          <span>Tankování</span>
        </button>
        <button
          className={"od-tab" + (view === "predict" ? " is-active" : "")}
          onClick={() => onGo("predict")}
        >
          <MapPin size={22} />
          <span>Kde čekat</span>
        </button>
      </nav>
      <button
        className={"od-fab-add" + (menuOpen ? " is-hidden" : "")}
        onClick={onAdd}
        aria-label={view === "predict" ? "Zapsat výjezd" : "Přidat zásah"}
        title={view === "predict" ? "Zapsat výjezd" : "Přidat zásah"}
      >
        <Plus size={26} />
      </button>
    </>
  );
}
