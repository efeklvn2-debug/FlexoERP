export function PhlexMark({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="2.2" opacity="0.9" />
      <circle cx="20" cy="20" r="10.5" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
      <circle cx="20" cy="20" r="4" fill="currentColor" />
      <path
        d="M20 4 A16 16 0 0 1 36 20"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        opacity="1"
      />
      <path d="M20 12.5 V15.5 M20 24.5 V27.5 M12.5 20 H15.5 M24.5 20 H27.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}
