/**
 * What is left of the inbox's glyphs.
 *
 * One, because the layout carries no status, no counts and no verdicts - see InboxRow. This is
 * the mark on the repository picker, and it is decorative there.
 */
export function FilterIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />
    </svg>
  );
}
