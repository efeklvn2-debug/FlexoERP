/** Shared brand wordmark: phlex + italic ERP */
export function BrandWordmark({
  className = '',
  size = 'md'
}: {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const sizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-3xl',
    xl: 'text-5xl'
  }
  return (
    <span className={`font-extrabold tracking-tight leading-none ${sizes[size]} ${className}`}>
      <span className="not-italic">phlex</span>
      <span className="italic font-bold tracking-normal opacity-95">ERP</span>
    </span>
  )
}
