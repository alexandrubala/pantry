import { useEffect, useState } from 'react'

export function ProductImage({
  url,
  fallbackUrl = null,
  name,
  sizeClassName = 'size-20',
  decorative = false,
}: {
  url: string | null
  fallbackUrl?: string | null
  name: string
  sizeClassName?: string
  decorative?: boolean
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const label = name.trim() || 'Produs'
  const src = url && failedUrl !== url ? url : fallbackUrl && failedUrl !== fallbackUrl ? fallbackUrl : null

  useEffect(() => {
    setFailedUrl(null)
  }, [url, fallbackUrl])

  if (!src) {
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
      src={src}
      alt={decorative ? '' : label}
      loading="lazy"
      onError={() => setFailedUrl(src)}
      className={`shrink-0 rounded-xl object-cover ${sizeClassName}`}
    />
  )
}
