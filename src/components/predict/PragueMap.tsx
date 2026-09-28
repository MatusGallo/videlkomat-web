import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoPoint } from "../../predict/types";
import { pointAlong } from "../../predict/geo";

export type MapZone = {
  id: string;
  path: [number, number][];
  color: string;
  tooltip: string;
  selected?: boolean;
  // Aktivní uzavírka / zúžení → šrafování a výstražná ikona.
  alert?: string;
  // Utlumený úsek (filtr silnice).
  dim?: boolean;
};
export type MapStand = {
  id: string;
  pos: GeoPoint;
  tooltip: string;
  best?: boolean;
  active?: boolean;
  selected?: boolean;
  // Návrh nového stanoviště (čárkovaný pin).
  suggest?: boolean;
  // Název vedle pinu (doporučené stanoviště) – písmeno samo řidiči nic neřekne.
  label?: string;
};
export type MapMe = { pos: GeoPoint; accuracy: number };
export type MapDot = { id: string; pos: GeoPoint; color: string; tooltip: string };

type Props = {
  zones: MapZone[];
  stands: MapStand[];
  dots?: MapDot[];
  // Moje poloha (GPS).
  me?: MapMe | null;
  // Přiblížit na tyto body, kdykoli se změní klíč (filtr silnice).
  focus?: { key: string; points: [number, number][] } | null;
  // Režim výběru polohy: klepnutí do mapy vrátí souřadnice.
  picking?: boolean;
  onPick?: (p: GeoPoint) => void;
  onZoneClick?: (id: string) => void;
  // Podržení prstu (na počítači pravé tlačítko) na úseku.
  onZoneHold?: (id: string, p: GeoPoint) => void;
  onStandClick?: (id: string) => void;
  onBackgroundClick?: () => void;
  className?: string;
};

// Standardní dlaždice OSM (bez API klíče); do tmava je převádí CSS filtr
// (.pr-map .leaflet-tile-pane), ať vynikne obarvení úseků.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const PRAGUE: L.LatLngExpression = [50.075, 14.52];
const WARN_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';

type Handlers = Pick<Props, "onPick" | "onZoneClick" | "onZoneHold" | "onStandClick" | "onBackgroundClick"> & {
  picking?: boolean;
};

// Mapa Prahy s úseky (obarvenými podle poptávky nebo dosahu), piny stanovišť
// a tečkami výjezdů. Leaflet běží imperativně: mapa vznikne jednou, vrstvy se
// překreslují z props, obsluha událostí jde přes ref (vždy aktuální callbacky).
const NO_DOTS: MapDot[] = [];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function PragueMap({ zones, stands, dots = NO_DOTS, me = null, focus = null, className, ...handlers }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fittedRef = useRef(false);
  const hRef = useRef<Handlers>({});
  useEffect(() => {
    hRef.current = handlers;
  });

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const map = L.map(el, { center: PRAGUE, zoom: 12, scrollWheelZoom: false, zoomControl: true });
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      const h = hRef.current;
      if (h.picking) h.onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
      else h.onBackgroundClick?.();
    });
    mapRef.current = map;
    // Panel mění šířku (sidebar, rotace telefonu) → přepočítat dlaždice.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    for (const z of zones) {
      if (z.path.length < 2) continue;
      if (z.selected) {
        L.polyline(z.path, { color: "#ede9e2", weight: 15, opacity: 0.9, lineCap: "round", interactive: false }).addTo(layer);
      }
      // Tmavá „obruba" pod barvou, ať je úsek čitelný i nad světlejšími dlaždicemi.
      const o = z.dim ? 0.22 : 1;
      L.polyline(z.path, { color: "#0b0a09", weight: 11, opacity: 0.85 * o, lineCap: "round", interactive: false }).addTo(layer);
      L.polyline(z.path, { color: z.color, weight: z.dim ? 5 : 7, opacity: o, lineCap: "round", interactive: false }).addTo(layer);
      if (z.alert) {
        // Šrafování uzavírky: krátké tmavé čárky přes barvu úseku.
        L.polyline(z.path, { color: "#141210", weight: 5, opacity: 0.9, dashArray: "3 9", lineCap: "butt", interactive: false }).addTo(layer);
        const mid = pointAlong(z.path, 0.5);
        if (mid) {
          L.marker([mid.lat, mid.lng], {
            icon: L.divIcon({ className: "pr-mpin-wrap", html: `<span class="pr-mwarn">${WARN_SVG}</span>`, iconSize: [24, 24], iconAnchor: [12, 30] }),
            interactive: false,
            keyboard: false,
          }).addTo(layer);
        }
      }
      // Neviditelná široká čára = pohodlný cíl pro prst; nese tooltip i události.
      const hit = L.polyline(z.path, { color: "#000", weight: 26, opacity: 0, bubblingMouseEvents: false })
        .bindTooltip(z.tooltip + (z.alert ? `<br><span class="pr-map-warn">⚠ ${z.alert}</span>` : ""), {
          sticky: true, className: "pr-map-tip", direction: "top",
        })
        .addTo(layer);
      hit.on("click", (e: L.LeafletMouseEvent) => {
        const h = hRef.current;
        if (h.picking) h.onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
        else h.onZoneClick?.(z.id);
      });
      hit.on("contextmenu", (e: L.LeafletMouseEvent) => {
        L.DomEvent.preventDefault(e.originalEvent);
        hRef.current.onZoneHold?.(z.id, { lat: e.latlng.lat, lng: e.latlng.lng });
      });
    }

    for (const dot of dots) {
      L.circleMarker([dot.pos.lat, dot.pos.lng], {
        radius: 5, color: "#141210", weight: 2, fillColor: dot.color, fillOpacity: 1, bubblingMouseEvents: false,
      })
        .bindTooltip(dot.tooltip, { className: "pr-map-tip", direction: "top", offset: [0, -4] })
        .addTo(layer);
    }

    for (const s of stands) {
      const cls = ["pr-mpin", s.best && "is-best", s.active && "is-active", s.selected && "is-selected", s.suggest && "is-suggest"].filter(Boolean).join(" ");
      const icon = L.divIcon({ className: "pr-mpin-wrap", html: `<span class="${cls}">${esc(s.id)}</span>${s.label ? `<span class="pr-mpin-label">${esc(s.label)}</span>` : ""}`, iconSize: [30, 30], iconAnchor: [15, 15] });
      L.marker([s.pos.lat, s.pos.lng], { icon, zIndexOffset: s.best || s.active || s.selected ? 1000 : 0 })
        .bindTooltip(s.tooltip, { className: "pr-map-tip", direction: "top", offset: [0, -14] })
        .on("click", () => hRef.current.onStandClick?.(s.id))
        .addTo(layer);
    }

    if (me) {
      L.circle([me.pos.lat, me.pos.lng], { radius: Math.min(me.accuracy, 1500), color: "#4ea1ff", weight: 1, opacity: 0.6, fillColor: "#4ea1ff", fillOpacity: 0.12, interactive: false }).addTo(layer);
      L.circleMarker([me.pos.lat, me.pos.lng], { radius: 7, color: "#ffffff", weight: 3, fillColor: "#4ea1ff", fillOpacity: 1, interactive: false }).addTo(layer);
    }

    // Poprvé přiblížit na celý koridor (dál už nechat, jak si to řidič posune).
    if (!fittedRef.current) {
      const pts: L.LatLngExpression[] = [
        ...zones.flatMap((z) => z.path),
        ...stands.map((s) => [s.pos.lat, s.pos.lng] as [number, number]),
      ];
      if (pts.length > 1) {
        map.fitBounds(L.latLngBounds(pts), { padding: [24, 24] });
        fittedRef.current = true;
      }
    }
  }, [zones, stands, dots, me]);

  // Filtr silnice → přiblížit na ni.
  const focusKey = focus?.key;
  const focusRef = useRef(focus);
  useEffect(() => {
    focusRef.current = focus;
  });
  useEffect(() => {
    const map = mapRef.current;
    const pts = focusRef.current?.points;
    if (!map || !focusKey || !pts || pts.length < 2) return;
    map.flyToBounds(L.latLngBounds(pts), { padding: [28, 28], duration: 0.6 });
  }, [focusKey]);

  return (
    <div
      ref={elRef}
      className={"pr-map" + (handlers.picking ? " is-picking" : "") + (className ? " " + className : "")}
    />
  );
}
