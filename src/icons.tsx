// Ikony vznikají přes továrnu makeIcon, což pravidlo pro fast refresh nepozná jako
// komponenty. Při změně tohoto souboru se prostě udělá full reload – nevadí.
/* eslint-disable react-refresh/only-export-components */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const makeIcon = (inner: string) =>
  function Icon({ size = 18, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...rest}
        dangerouslySetInnerHTML={{ __html: inner }}
      />
    );
  };

export const Truck = makeIcon('<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>');
export const LayoutDashboard = makeIcon('<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>');
export const CalendarDays = makeIcon('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>');
export const ArrowUpRight = makeIcon('<path d="M7 7h10v10"/><path d="M7 17 17 7"/>');
export const ArrowDownRight = makeIcon('<path d="m7 7 10 10"/><path d="M17 7v10H7"/>');
export const Plus = makeIcon('<path d="M5 12h14"/><path d="M12 5v14"/>');
export const X = makeIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
export const Menu = makeIcon('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>');
export const Pencil = makeIcon('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>');
export const Check = makeIcon('<path d="M20 6 9 17l-5-5"/>');
export const AlertTriangle = makeIcon('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>');
export const LogOut = makeIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>');
export const Banknote = makeIcon('<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>');
export const TrendingUp = makeIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>');
export const Wallet = makeIcon('<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3"/><path d="M21 12a2 2 0 0 0-2-2h-3a2 2 0 0 0 0 4h3a2 2 0 0 0 2-2Z"/>');
export const ChevronDown = makeIcon('<path d="m6 9 6 6 6-6"/>');
export const Trash = makeIcon('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>');
export const Fuel = makeIcon('<line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>');
export const Droplet = makeIcon('<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>');
export const ChevronLeft = makeIcon('<path d="m15 18-6-6 6-6"/>');
export const ChevronRight = makeIcon('<path d="m9 18 6-6-6-6"/>');

export const MapPin = makeIcon('<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>');
export const Download = makeIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>');
export const Target = makeIcon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>');
export const Crosshair = makeIcon('<circle cx="12" cy="12" r="8"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/><circle cx="12" cy="12" r="2"/>');
export const Navigation = makeIcon('<polygon points="3 11 22 2 13 21 11 13 3 11"/>');
export const CalendarClock = makeIcon('<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/>');
export const Clock = makeIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>');

// Brand logo: odtahovka s mincí na háku („vydělá si“) – zjednodušená verze /icon.svg pro malé velikosti.
export function Logo({ size = 24, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" aria-hidden {...rest}>
      <defs>
        <linearGradient id="vk-logo-grad" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
          <stop stopColor="#26221E" />
          <stop offset="1" stopColor="#141210" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="136" fill="url(#vk-logo-grad)" stroke="#3A342E" strokeWidth="8" />
      <g transform="translate(256 262) scale(1.12) translate(-256 -266)">
        <path d="M206 284 L132 166" stroke="#F4EFE8" strokeWidth="30" strokeLinecap="round" />
        <path d="M132 166 V212" stroke="#F4EFE8" strokeWidth="8" strokeLinecap="round" />
        <circle cx="132" cy="258" r="44" fill="#F4711E" />
        <circle cx="132" cy="258" r="24" stroke="#141210" strokeWidth="7" opacity=".35" />
        <path d="M186 272 h140 v58 H200 q-14 0-14-14 Z" fill="#F4EFE8" />
        <path d="M318 214 q0-16 16-16 h40 q11 0 17 9 l30 44 q5 7 5 16 v49 q0 14-14 14 H318 Z" fill="#F4EFE8" />
        <path d="M344 218 h26 q7 0 11 6 l20 30 q4 7-4 7 h-53 q-7 0-7-7 v-29 q0-7 7-7 Z" fill="#1D1A17" />
        <circle cx="228" cy="344" r="46" fill="#1D1A17" />
        <circle cx="228" cy="344" r="38" fill="#F4EFE8" />
        <circle cx="228" cy="344" r="16" fill="#1D1A17" />
        <circle cx="376" cy="344" r="46" fill="#1D1A17" />
        <circle cx="376" cy="344" r="38" fill="#F4EFE8" />
        <circle cx="376" cy="344" r="16" fill="#1D1A17" />
      </g>
    </svg>
  );
}
