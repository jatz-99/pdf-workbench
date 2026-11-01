// Small inline stroke icons (24x24); they inherit the text colour
function Icon({ children, className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const ChevronLeft = (props) => <Icon {...props}><path d="M15 6l-6 6 6 6" /></Icon>;
export const ChevronRight = (props) => <Icon {...props}><path d="M9 6l6 6-6 6" /></Icon>;
export const ZoomIn = (props) => <Icon {...props}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" /></Icon>;
export const ZoomOut = (props) => <Icon {...props}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6" /></Icon>;
export const RotateLeft = (props) => <Icon {...props}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></Icon>;
export const RotateRight = (props) => <Icon {...props}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></Icon>;
export const Trash = (props) => <Icon {...props}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Icon>;
export const ArrowUp = (props) => <Icon {...props}><path d="M12 19V5M6 11l6-6 6 6" /></Icon>;
export const ArrowDown = (props) => <Icon {...props}><path d="M12 5v14M6 13l6 6 6-6" /></Icon>;
export const Undo = (props) => <Icon {...props}><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></Icon>;
export const Merge = (props) => <Icon {...props}><path d="M6 3v6a6 6 0 0 0 6 6h0a6 6 0 0 0 6-6V3M12 15v6" /></Icon>;
export const Download = (props) => <Icon {...props}><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></Icon>;
export const Upload = (props) => <Icon {...props}><path d="M12 16V5M7 9l5-5 5 5M5 20h14" /></Icon>;
export const Thumbnails = (props) => (
  <Icon {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M5.5 8h1M5.5 12h1M5.5 16h1" /></Icon>
);

export function LogoMark({ className = "h-9 w-9" }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="var(--primary)" />
      <path d="M12 9h11l6 6v16a1 1 0 0 1-1 1H12a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z" fill="var(--on-primary)" opacity="0.95" />
      <path d="M23 9v6h6" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="15" y="19" width="10" height="2.4" rx="1.2" fill="var(--accent)" />
      <rect x="15" y="24" width="7" height="2.4" rx="1.2" fill="var(--primary)" opacity="0.45" />
    </svg>
  );
}

export function HeroIllustration() {
  return (
    <svg viewBox="0 0 480 360" className="h-full w-full" role="img" aria-label="A document with highlighted text and table blocks">
      <circle cx="372" cy="84" r="70" fill="var(--accent)" opacity="0.08" />
      <circle cx="372" cy="84" r="26" fill="var(--accent)" />
      <path d="M40 330l110-170 90 170z" fill="#adbcae" />
      <path d="M170 330l90-140 100 140z" fill="#7a9582" />
      <path d="M300 330l70-120 110 120z" fill="#a8b8a9" />
      <g transform="translate(150 40)">
        <rect width="190" height="250" rx="14" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
        <rect x="20" y="24" width="90" height="12" rx="6" fill="var(--fg)" />
        <rect x="20" y="52" width="150" height="8" rx="4" fill="var(--line-strong)" />
        <rect x="20" y="68" width="125" height="8" rx="4" fill="var(--accent)" opacity="0.35" />
        <rect x="20" y="84" width="140" height="8" rx="4" fill="var(--line-strong)" />
        <rect x="20" y="116" width="150" height="86" rx="8" fill="none" stroke="var(--line-strong)" strokeWidth="2" />
        <path d="M20 145h150M20 174h150M70 116v86M120 116v86" stroke="var(--line-strong)" strokeWidth="2" />
        <rect x="76" y="122" width="38" height="17" rx="4" fill="var(--accent)" opacity="0.55" />
        <rect x="20" y="218" width="100" height="8" rx="4" fill="var(--line-strong)" />
      </g>
      <path d="M96 250c40-60 110-90 160-96" fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" />
      <path d="M256 154l-18-14 4 22z" fill="var(--accent)" />
    </svg>
  );
}
