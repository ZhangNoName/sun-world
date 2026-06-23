import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import path from 'path'

export default defineConfig(({ mode }) => {
  const isLib = mode === 'lib'

  return {
    plugins: [
      vue(),
      dts({
        outDir: 'dist/types',
        insertTypesEntry: true,
        include: ['src/**/*.ts', 'src/vue/**/*.vue'],
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
              vue: path.resolve(__dirname, 'src/vue/index.ts'),
            },
            name: 'SunWorldIcons',
            fileName: (format, entryName) => `${entryName}.${format}.js`,
          },
          rollupOptions: {
            external: ['vue'],
            output: { globals: { vue: 'Vue' } },
          },
        }
      : {
          outDir: 'dist-preview',
        },

    optimizeDeps: {
      entries: isLib ? ['src/index.ts'] : ['main.ts'],
    },

    server: { port: 2333 },
  }
})
