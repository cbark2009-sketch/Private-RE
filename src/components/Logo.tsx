/**
 * The site's mark - a house on the accent-colored tile, drawn in the same
 * accent/navy pair the site's buttons use, so it follows light and dark
 * mode with everything else. A stand-in until there's a real logo file:
 * swapping that in means replacing this one component.
 */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="12" style={{ fill: "var(--accent)" }} />
      <g style={{ stroke: "var(--navy)" }} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* roof */}
        <path d="M11 24.5 24 13l13 11.5" />
        {/* walls */}
        <path d="M15.5 21.5V35h17V21.5" />
        {/* door */}
        <path d="M21.5 35v-6.5h5V35" />
      </g>
    </svg>
  );
}
