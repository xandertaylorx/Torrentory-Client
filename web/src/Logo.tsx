export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={`torrentory-mark ${className}`}
      role="img"
      aria-label="Torrentory ship logo"
    >
      <path
        className="torrentory-mark__left-sail"
        fill="currentColor"
        d="M30 10v25H12l18-25Z"
      />
      <path
        className="torrentory-mark__right-sail"
        fill="currentColor"
        d="M34 8v27h18L34 8Z"
      />
      <path
        className="torrentory-mark__hull"
        fill="currentColor"
        d="M9 39h46l-8 13H18L9 39Z"
      />
    </svg>
  );
}
