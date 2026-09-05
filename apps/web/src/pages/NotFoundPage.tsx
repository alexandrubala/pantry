import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="mt-2 text-muted">This page does not exist.</p>
      <p className="mt-4">
        <Link to="/" className="text-accent">
          Go home
        </Link>
      </p>
    </section>
  )
}
