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
        include: ['src/**/*.ts', 'src/components/**/*.vue'],
      }),
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    build: isLib
      ? {
          cssCodeSplit: true,
          lib: {
            entry: {
              ui: path.resolve(__dirname, 'src/index.ts'),
              button: path.resolve(__dirname, 'src/button.ts'),
              input: path.resolve(__dirname, 'src/input.ts'),
              'date-picker': path.resolve(__dirname, 'src/date-picker.ts'),
              list: path.resolve(__dirname, 'src/list.ts'),
              pagination: path.resolve(__dirname, 'src/pagination.ts'),
              tag: path.resolve(__dirname, 'src/tag.ts'),
              'loading-skeleton': path.resolve(__dirname, 'src/loading-skeleton.ts'),
              'theme-provider': path.resolve(__dirname, 'src/theme-provider.ts'),
            },
            name: 'SunWorldUi',
            fileName: (format, entryName) => `${entryName}.${format}.js`,
          },
          rollupOptions: {
            external: ['vue'],
            output: {
              globals: {
                vue: 'Vue',
              },
            },
          },
        }
      : {
          outDir: 'dist-preview',
        },
  }
})
