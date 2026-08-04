export function Logo({ wordmark = true }: { wordmark?: boolean }) {
  return <div className="logo" aria-label="Torrentory Client">
    <svg className="logo-mark" viewBox="0 0 64 64" role="img" aria-label="Torrentory ship logo">
      <path className="sail-left" d="M30 10v25H12l18-25Z" />
      <path className="sail-right" d="M34 8v27h18L34 8Z" />
      <path className="hull" d="M9 39h46l-8 13H18L9 39Z" />
    </svg>
    {wordmark && <span>Torrentory</span>}
  </div>;
}
