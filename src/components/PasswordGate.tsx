import { useEffect, useRef, useState, type ReactNode } from "react";
import { LoginBackground } from "./LoginBackground";
import { AUTH_KEY, AUTH_PW_KEY } from "../utils/auth";
import { Logo } from "../icons";

const HASH = "7e11bc65a7852d1c5833549ad3a1bbc743deac167c2f18ae11b7b2784dd8d00d";

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

// Čistě JS SHA-256 (fallback, když crypto.subtle není – tj. HTTP mimo localhost,
// např. otevření dev serveru přes LAN IP na tabletu/mobilu).
function sha256Js(msg: Uint8Array): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const l = msg.length;
  const withOne = l + 1;
  const pad = (56 - (withOne % 64) + 64) % 64;
  const total = withOne + pad + 8;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  const bitLen = l * 8;
  dv.setUint32(total - 4, bitLen >>> 0);
  dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H).map((x) => x.toString(16).padStart(8, "0")).join("");
}

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", bytes);
    return toHex(new Uint8Array(buf));
  }
  return sha256Js(bytes);
}

export function PasswordGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(() => localStorage.getItem(AUTH_KEY) === "1");
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);
  const [pending, setPending] = useState(false);
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const gateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authed) ref.current?.focus({ preventScroll: true });
  }, [authed]);

  // iOS/Android: výšku vrstvy řídíme podle viditelné plochy (VisualViewport),
  // takže při otevření klávesnice se obsah neposune – vrstva se jen zmenší zdola.
  useEffect(() => {
    if (authed) return;
    const vv = window.visualViewport;
    const el = gateRef.current;
    if (!vv || !el) return;
    const apply = () => {
      // Kontejner obsahu = přesně viditelná plocha nad klávesnicí.
      // translateY(offsetTop) drží obsah přilepený k viditelné části, takže
      // se pro uživatele neposune. Pozadí (vk-bg) je oddělené a statické → necuká.
      el.style.height = `${vv.height}px`;
      el.style.transform = `translateY(${vv.offsetTop}px)`;
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [authed]);

  if (authed) return <>{children}</>;

  const submit = async () => {
    setPending(true);
    setErr(false);
    const h = await sha256(val);
    if (h === HASH) {
      localStorage.setItem(AUTH_KEY, "1");
      localStorage.setItem(AUTH_PW_KEY, val);
      setAuthed(true);
    } else {
      setErr(true);
      setVal("");
      ref.current?.focus();
    }
    setPending(false);
  };

  return (
    <>
    <div className="vk-bg" aria-hidden="true">
      <LoginBackground color="#f4711e" className="vk-dots" />
    </div>

    <div className="vk-gate" ref={gateRef}>
      <main className="vk-stage">
        <div className="vk-card">
          <div className="vk-card-brand">
            <Logo size={28} className="vk-card-logo" />
            <span className="vk-card-name">Vydělkomat</span>
          </div>

          <div className="vk-card-inner">
            <h1 className="vk-title">Vítejte zpět!</h1>
            <p className="vk-sub">Zadej heslo a pokračuj ke&nbsp;svým výdělkům.</p>

            <div className={"vk-line" + (err ? " is-err" : "")}>
              <input
                ref={ref}
                className="vk-input"
                type={show ? "text" : "password"}
                placeholder="Heslo"
                value={val}
                onChange={(e) => {
                  setVal(e.target.value);
                  if (err) setErr(false);
                }}
                onKeyDown={(e) => e.key === "Enter" && val && !pending && submit()}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="vk-eye"
                onClick={() => {
                  setShow((s) => !s);
                  ref.current?.focus({ preventScroll: true });
                }}
                aria-label={show ? "Skrýt heslo" : "Zobrazit heslo"}
                aria-pressed={show}
                tabIndex={-1}
              >
                {show ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" x2="22" y1="2" y2="22" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            <button className="vk-go" onClick={submit} disabled={!val || pending}>
              {pending ? <span className="vk-spin" aria-hidden="true" /> : null}
              <span>{pending ? "Ověřuji…" : "Přihlásit se"}</span>
            </button>

            <p className={"vk-err" + (err ? " show" : "")} role="alert" aria-live="assertive">
              Nesprávné heslo. Zkus to znovu.
            </p>
          </div>
        </div>
      </main>
    </div>
    </>
  );
}
