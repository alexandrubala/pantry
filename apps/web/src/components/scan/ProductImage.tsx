import { useState } from 'react'

export function ProductImage({
  url,
  name,
  sizeClassName = 'size-20',
}: {
  url: string | null
  name: string
  sizeClassName?: string
}) {
  const [failed, setFailed] = useState(false)
  const label = name.trim() || 'Produs'

  if (!url || failed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl bg-surface text-lg font-semibold text-muted ${sizeClassName}`}
        aria-hidden="true"
      >
        {label.slice(0, 1).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={label}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-xl object-cover ${sizeClassName}`}
    />
  )
}
