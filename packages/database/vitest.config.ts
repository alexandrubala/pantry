import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['adapters/**/*.test.ts', 'migrations/**/*.test.ts'],
  },
})
