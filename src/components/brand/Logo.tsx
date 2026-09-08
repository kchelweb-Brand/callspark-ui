/**
 * The Kchel Dialer mark — "Forward K": a stem plus two chevrons, so the letter
 * also reads as fast-forward. It says dialer rather than phone system, which is
 * the distinction the product is sold on.
 *
 * Drawn on a 64×64 grid with round caps, and coloured from the brand tokens so
 * the mark follows the theme rather than pinning three hex values into every
 * page that renders it.
 */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Kchel Dialer"
      fill="none"
    >
      <rect x="10" y="12" width="9" height="40" rx="4.5" fill="var(--color-brand-green)" />
      <path
        d="M25 15 L41 32 L25 49"
        stroke="var(--color-brand-blue)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M43 22 L53 32 L43 42"
        stroke="var(--color-brand-yellow)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Mark plus wordmark. `tone` picks the wordmark colour for the surface it sits
 * on — "invert" for the dark sidebar and the marketing header, where the
 * foreground token would render the text nearly invisible.
 */
export function Logo({
  className = "",
  markClassName = "size-8",
  tone = "default",
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  tone?: "default" | "invert";
  showWordmark?: boolean;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} />
      {showWordmark && (
        <span
          className={`font-extrabold tracking-tight ${
            tone === "invert" ? "text-white" : "text-foreground"
          }`}
        >
          Kchel Dialer
        </span>
      )}
    </span>
  );
}
