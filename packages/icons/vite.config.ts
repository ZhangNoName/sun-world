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
        include: ['src'],
      }),
    ],

    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },

    build: isLib
      ? {
          lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            name: 'Icons',
            fileName: (format) => `icons.${format}.js`,
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
