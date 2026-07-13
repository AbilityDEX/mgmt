type StatusBadgeProps = {
  label: string
  variant?: 'success' | 'danger' | 'warning' | 'neutral'
}

const variantStyles: Record<NonNullable<StatusBadgeProps['variant']>, { outer: string; dot: string }> = {
  success: { outer: 'bg-emerald-700/10 text-emerald-300 border border-emerald-700/20', dot: 'bg-emerald-400' },
  danger: { outer: 'bg-rose-600/10 text-rose-300 border border-rose-600/20', dot: 'bg-rose-400' },
  warning: { outer: 'bg-amber-500/10 text-amber-300 border border-amber-500/20', dot: 'bg-amber-400' },
  neutral: { outer: 'bg-slate-700/10 text-slate-300 border border-slate-700/10', dot: 'bg-slate-400' },
}

export default function StatusBadge({ label, variant = 'neutral' }: StatusBadgeProps) {
  const styles = variantStyles[variant]
  return (
    <span className={`inline-flex items-center gap-2 rounded-3xl px-3 py-1 text-xs font-semibold ${styles.outer}`}>
      <span className={`${styles.dot} h-2.5 w-2.5 rounded-full flex-shrink-0`} aria-hidden />
      {label}
    </span>
  )
}
