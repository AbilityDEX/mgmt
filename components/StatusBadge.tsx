type StatusBadgeProps = {
  label: string
  variant?: 'success' | 'danger' | 'warning' | 'neutral'
}

const variantStyles: Record<NonNullable<StatusBadgeProps['variant']>, string> = {
  success: 'bg-emerald-600/15 text-emerald-300',
  danger: 'bg-rose-600/15 text-rose-300',
  warning: 'bg-amber-500/15 text-amber-300',
  neutral: 'bg-slate-700/15 text-slate-300',
}

export default function StatusBadge({ label, variant = 'neutral' }: StatusBadgeProps) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${variantStyles[variant]}`}>
      {label}
    </span>
  )
}
