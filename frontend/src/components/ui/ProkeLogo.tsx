export const ProkeLogo = ({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    className={className}
  >
    <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.1" />
    {/* A pull request line, poked. */}
    <circle cx="10" cy="9" r="2.5" stroke="currentColor" strokeWidth="2" />
    <circle cx="10" cy="23" r="2.5" stroke="currentColor" strokeWidth="2" />
    <path
      d="M10 11.5v9"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M22 13.5v3.5a4 4 0 0 1-4 4h-5.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="22" cy="9" r="3" fill="currentColor" />
  </svg>
);
