/**
 * The inbox's glyphs, hand-drawn rather than pulled from an icon package.
 *
 * The three CI states differ in shape before they differ in colour - a tick, a cross and a
 * clock hand - which is what keeps a row readable to anyone who does not separate red from green.
 */

interface IconProps {
  className?: string;
}

const STROKE = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function ChevronIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />
    </svg>
  );
}

/** CI passed. */
export function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="m5.4 8.2 1.85 1.85 3.35-3.95" />
    </svg>
  );
}

/** CI failed. */
export function XCircleIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="m6 6 4 4M10 6l-4 4" />
    </svg>
  );
}

/** CI still running. A clock rather than a spinner - nothing on this page animates per row. */
export function ClockCircleIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.6V8l2.2 1.6" />
    </svg>
  );
}

/** GitHub's draft marker: the pull request glyph with its joints left open. */
export function DraftPullRequestIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} strokeDasharray="2.2 2" className={className}>
      <circle cx="4" cy="3.6" r="1.85" />
      <circle cx="4" cy="12.4" r="1.85" />
      <path d="M4 5.45v5.1" />
      <circle cx="12" cy="12.4" r="1.85" />
      <path d="M12 10.55V6.2" />
    </svg>
  );
}

/** The repo-filter control's glyph. Decorative - the control does nothing on this page. */
export function FilterIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />
    </svg>
  );
}

export function RefreshIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M13.4 7a5.5 5.5 0 1 0-.3 3.2" />
      <path d="M13.6 3.4V7H10" />
    </svg>
  );
}
