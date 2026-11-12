// The mark of a playtest card (#1614), so a playtester always knows which cards are not real.
export default function PlaytestBadge({ className = '' }: { className?: string }) {
  return (
    <span
      data-testid="playtest-badge"
      className={`ml-1.5 inline-block rounded bg-amber-500/20 px-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300 align-middle ${className}`}
    >
      Playtest
    </span>
  );
}
