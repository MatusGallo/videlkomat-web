import { useEffect, useRef, useState } from "react";
import type { CSSProperties, TouchEvent } from "react";

const EASE = "cubic-bezier(.32, .72, 0, 1)";
const CLOSE_MS = 320; // dojezd sheetu při zavření tažením
const EXIT_MS = 260; // odchod při zavření tlačítkem – drží se s --t-exit v CSS

// Potáhnutí bottom sheetu dolů = zavření (jako iOS). Aktivní jen na mobilu;
// drag začne jen když je obsah odscrollovaný nahoře, ať nekoliduje se scrollem.
// Po překročení prahu sheet plynule dojede dolů a teprve pak se zavře.
//
// Hook zároveň drží sheet ještě chvíli v DOMu i po zavření (`mounted`), aby
// stihl odejít. Bez toho modal zmizel skokem – vyjel plynule a pak lupnul pryč.
export function useSheetDrag(onClose: () => void, open: boolean) {
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const [alive, setAlive] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);
  const startY = useRef<number | null>(null);
  const enabled = useRef(
    typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches,
  );

  // Reset při každém otevření – jinak by po zavření tažením zůstalo dy/closing
  // a sheet by se příště vykreslil mimo obrazovku (= „zmizel by").
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDy(0);
      setDragging(false);
      setClosing(false);
      setAlive(true);
    }
  }

  const mounted = open || alive;
  const exiting = alive && !open;

  // Po zavření necháme obsah ještě EXIT_MS v DOMu, ať odchodová animace dojede.
  useEffect(() => {
    if (!exiting) return;
    startY.current = null;
    const t = window.setTimeout(() => setAlive(false), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [exiting]);

  const onTouchStart = (e: TouchEvent<HTMLElement>) => {
    if (!enabled.current || closing) return;
    startY.current = e.currentTarget.scrollTop <= 0 ? e.touches[0].clientY : null;
  };
  const onTouchMove = (e: TouchEvent<HTMLElement>) => {
    if (startY.current === null || closing) return;
    const d = e.touches[0].clientY - startY.current;
    if (d > 0) {
      if (!dragging) setDragging(true);
      setDy(d);
    } else if (dragging) {
      setDragging(false);
      setDy(0);
      startY.current = null;
    }
  };
  const onTouchEnd = () => {
    if (startY.current === null || closing) return;
    startY.current = null;
    setDragging(false);
    if (dy > 110) {
      // Dojet plynule dolů, pak teprve zavřít (žádné strohé zmizení).
      setClosing(true);
      setDy(typeof window !== "undefined" ? window.innerHeight : 900);
      window.setTimeout(onClose, CLOSE_MS);
    } else {
      setDy(0);
    }
  };

  const style: CSSProperties = {
    transform: dy ? `translateY(${dy}px)` : undefined,
    transition: dragging ? "none" : `transform ${CLOSE_MS}ms ${EASE}`,
    // Zavření tažením si polohu řídí samo – odchodová CSS animace by inline
    // transform přebila a sheet by před zmizením vyskočil zpátky nahoru.
    animation: closing ? "none" : undefined,
    willChange: dragging || closing ? "transform" : undefined,
  };

  return {
    mounted,
    // Backdrop i sheet berou stav odchodu z jedné třídy na wrapperu.
    wrapClass: "od-modal-wrap" + (exiting ? " is-exiting" : ""),
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
    style,
  };
}
