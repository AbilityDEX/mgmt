import { useEffect, useState } from 'react'

function formatDuration(ms: number) {
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default function Countdown({ target }: { target: string | null }) {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    if (!target) {
      setLabel(null)
      return
    }

    const update = () => {
      try {
        const t = new Date(target).getTime()
        const now = Date.now()
        const diff = t - now
        if (diff >= 0) {
          setLabel(`Deadline in ${formatDuration(diff)}`)
        } else {
          setLabel(`Overdue by ${formatDuration(-diff)}`)
        }
      } catch {
        setLabel(null)
      }
    }

    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [target])

  if (!label) return null
  return <div className="text-sm text-slate-200">{label}</div>
}
