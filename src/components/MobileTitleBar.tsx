import { useEffect } from "react";

// iOS large-title: plynulý scroll-linked přechod. JS jen průběžně počítá
// „scroll progress" 0→1 a dá ho do CSS proměnné --sp; parallax velkého titulu
// i nabíhání průsvitné lišty pak interpoluje CSS. Jen mobil/tablet (viz CSS).
const COLLAPSE = 68; // px scrollu, po kterých je titul plně sbalený

export function MobileTitleBar({ title }: { title: string }) {
  useEffect(() => {
    let raf = 0;
    const root = document.documentElement;
    const readY = (t: EventTarget | null): number => {
      if (!t || t === window || t === document || t === root || t === document.body) {
        return window.scrollY || root.scrollTop || document.body.scrollTop || 0;
      }
      return (t as HTMLElement).scrollTop || 0;
    };
    let lastY = window.scrollY || 0;
    const apply = () => {
      raf = 0;
      const p = Math.min(1, Math.max(0, lastY / COLLAPSE));
      root.style.setProperty("--sp", String(p));
    };
    const onScroll = (e: Event) => {
      lastY = readY(e.target);
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    // capture:true chytá i scroll na vnitřním scrolleru (nejen na window).
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      if (raf) cancelAnimationFrame(raf);
      root.style.removeProperty("--sp");
    };
  }, []);

  return (
    <div className="od-navbar" aria-hidden="true">
      {/* Progresivní blur (iOS 26): vrstvy se skládají, takže rozostření sílí
          k hornímu okraji a dolů se maskou vytrácí do nuly – žádná ostrá hrana. */}
      <div className="od-navbar-blur">
        <div className="od-navbar-l1" />
        <div className="od-navbar-l2" />
        <div className="od-navbar-l3" />
        <div className="od-navbar-l4" />
        <div className="od-navbar-tint" />
      </div>
      <span className="od-navbar-title">{title}</span>
    </div>
  );
}
