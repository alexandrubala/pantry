import { LoaderCircle } from 'lucide-react'

export function SessionLoading({ className }: { className?: string }) {
  return (
    <div
      className={className ?? 'flex flex-1 flex-col items-center justify-center'}
      role="status"
      aria-live="polite"
    >
      <LoaderCircle className="size-6 animate-spin text-accent" aria-hidden="true" />
      <p className="mt-3 text-sm text-muted">Se încarcă...</p>
    </div>
  )
}
