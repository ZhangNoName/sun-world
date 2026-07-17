import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import path from 'path'

export default defineConfig(({ mode }) => {
  const isLib = mode === 'lib'

  return {
    plugins: [
      react(),
      dts({
        outDir: 'dist/types',
        insertTypesEntry: true,
        include: ['src/**/*.ts', 'src/**/*.tsx'],
        exclude: ['src/**/*.spec.*', 'src/test/**', 'src/main.tsx'],
      }),
    ],

    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },

    build: isLib
      ? {
          lib: {
            entry: {
              icons: path.resolve(__dirname, 'src/index.ts'),
              core: path.resolve(__dirname, 'src/core.ts'),
              react: path.resolve(__dirname, 'src/react/index.ts'),
            },
            name: 'SunWorldIcons',
            fileName: (format, entryName) => `${entryName}.${format}.js`,
          },
          rollupOptions: {
            external: ['react', 'react-dom', 'react/jsx-runtime'],
          },
        }
      : {
          outDir: 'dist-preview',
        },

    optimizeDeps: {
      entries: isLib ? ['src/index.ts'] : ['src/main.tsx'],
    },

    server: { port: 2333 },
  }
})
