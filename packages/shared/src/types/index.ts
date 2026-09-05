export const UNITS = ['g', 'ml', 'each', 'package'] as const

export type Unit = (typeof UNITS)[number]
