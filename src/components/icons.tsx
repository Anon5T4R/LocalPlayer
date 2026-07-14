// Ícones inline (SVG, currentColor) — nada de fonte/pacote externo (100% offline).
import type { CSSProperties } from "react";

interface P {
  size?: number;
  style?: CSSProperties;
}
const base = (size = 20): CSSProperties => ({
  width: size,
  height: size,
  display: "block",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

export const IconPlay = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), fill: "currentColor", stroke: "none", ...style }}>
    <path d="M7 5.5v13l11-6.5z" />
  </svg>
);
export const IconPause = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), fill: "currentColor", stroke: "none", ...style }}>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);
export const IconPrev = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), fill: "currentColor", stroke: "none", ...style }}>
    <path d="M7 5v14h2V5zm3 7l9 7V5z" />
  </svg>
);
export const IconNext = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), fill: "currentColor", stroke: "none", ...style }}>
    <path d="M15 5v14h2V5zm-2 7L4 5v14z" />
  </svg>
);
export const IconVolume = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" />
    <path d="M16 8.5a4 4 0 0 1 0 7" />
    <path d="M18.5 6a7 7 0 0 1 0 12" />
  </svg>
);
export const IconMute = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" />
    <path d="M16 9l5 5m0-5l-5 5" />
  </svg>
);
export const IconFullscreen = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);
export const IconExitFullscreen = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
  </svg>
);
export const IconList = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);
export const IconSettings = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </svg>
);
export const IconFolder = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <path d="M3 6h6l2 2h10v10H3z" />
  </svg>
);
export const IconFile = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4" />
  </svg>
);
export const IconCaptions = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 13a2 2 0 1 1 0-2M15 13a2 2 0 1 1 0-2" />
  </svg>
);
export const IconAudio = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <path d="M9 18V5l10-2v13" />
    <circle cx="6" cy="18" r="3" fill="currentColor" stroke="none" />
    <circle cx="19" cy="16" r="3" fill="currentColor" stroke="none" />
  </svg>
);
export const IconSpeed = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <path d="M12 4a8 8 0 0 1 8 8H4a8 8 0 0 1 8-8z" />
    <path d="M12 12l4-3" />
  </svg>
);
export const IconChapters = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <path d="M6 4v16l6-4 6 4V4z" />
  </svg>
);
export const IconRepeat = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <path d="M4 12V9a3 3 0 0 1 3-3h11M20 12v3a3 3 0 0 1-3 3H6" />
    <path d="M16 3l3 3-3 3M8 21l-3-3 3-3" />
  </svg>
);
export const IconShuffle = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <path d="M4 6h4l10 12h2M4 18h4l3-3.5M15 6h5M17 3l3 3-3 3M20 18l-3 3-0 0" />
  </svg>
);
export const IconLoop = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <path d="M3 12a5 5 0 0 1 5-5h8a5 5 0 0 1 0 10H8" />
    <path d="M8 4L5 7l3 3" />
  </svg>
);
export const IconCamera = ({ size, style }: P) => (
  <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }}>
    <path d="M4 8h3l2-2h6l2 2h3v11H4z" />
    <circle cx="12" cy="13" r="3.2" />
  </svg>
);
