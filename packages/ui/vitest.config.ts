import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@sun-world\/ui\/(button|checkbox|dialog|dropdown-menu|select|tabs|tooltip)$/,
        replacement: `${path.resolve(__dirname, 'src/components')}/$1`,
      },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.react.spec.tsx'],
  },
})
