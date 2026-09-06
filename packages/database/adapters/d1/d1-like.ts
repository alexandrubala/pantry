export type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike
  first<T = unknown>(): Promise<T | null>
  run(): Promise<{ success: boolean }>
  all<T = unknown>(): Promise<{ results: T[] }>
}

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike
  batch(statements: D1PreparedStatementLike[]): Promise<unknown[]>
}
