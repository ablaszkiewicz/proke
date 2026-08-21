/**
 * The inbox's glyphs, hand-drawn rather than pulled from an icon package.
 *
 * A row carries two status columns that both mean "is this good news", and they must not be
 * mistakable for each other at a glance. So checks are drawn as outlines and the review verdict
 * as a solid - the shapes differ before the colours do, which is also what keeps the row
 * readable to anyone who does not separate red from green.
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

/** Somebody approved. Solid, so it cannot be confused with the checks column next to it. */
export function ApprovedIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M8 1.25a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5Zm3.28 5.1-3.9 4.35a.75.75 0 0 1-1.09.03L4.6 9.04a.75.75 0 1 1 1.06-1.06l1.13 1.13 3.37-3.76a.75.75 0 1 1 1.12 1Z" />
    </svg>
  );
}

/** Somebody asked for changes. */
export function ChangesRequestedIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M8 1.25a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM5.25 7.25h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5Z" />
    </svg>
  );
}

/** Nobody has decided yet. Hollow and dashed: an outline of a verdict rather than one. */
export function AwaitingReviewIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} strokeDasharray="2.6 2.4" className={className}>
      <circle cx="8" cy="8" r="6.25" />
    </svg>
  );
}

export function CommentIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M13.75 9.5a1.5 1.5 0 0 1-1.5 1.5H7.4l-2.9 2.35V11H3.75a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 3.75 2h8.5a1.5 1.5 0 0 1 1.5 1.5Z" />
    </svg>
  );
}

/** The open pull request glyph, used as the title's bullet. */
export function PullRequestIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <circle cx="4" cy="3.6" r="1.85" />
      <circle cx="4" cy="12.4" r="1.85" />
      <path d="M4 5.45v5.1" />
      <circle cx="12" cy="12.4" r="1.85" />
      <path d="M12 10.55V6.2a2 2 0 0 0-2-2H7.6" />
      <path d="m9.4 2.3-2 1.9 2 1.9" />
    </svg>
  );
}

/** The same shape, unfilled joints - GitHub's draft marker. */
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
