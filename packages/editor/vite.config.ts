// vite.config.ts
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts' // 注意导入方式可能略有不同，根据你安装的版本调整
import path from 'path'

export default defineConfig({
  build: {
    minify: 'esbuild',
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'SunWorldEditor',
      fileName: (format) => `editor.${format}.js`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [], // 如果 editor 有外部依赖（比如某个 UI 库），需要在这里列出
      output: {},
    },
  },
  plugins: [
    dts({
      // 指定 tsconfig 文件，确保插件使用正确的配置
      tsconfigPath: './tsconfig.app.json',
      // 指定入口文件，与 build.lib.entry 一致
      entryRoot: path.resolve(__dirname, 'src'), // 可选，但推荐
      // 输出目录，默认是 dist
      outDir: 'dist',
      rollupTypes: true,
      // 清理之前的 .d.ts 文件
      cleanVueFileName: true, // 虽然是 vue 插件，但有时也适用
      // staticImport: true, // 尝试启用，看是否改善
      // skipDiagnostics: false, // 不跳过诊断，有助于发现问题
      // logLevel: 'info' // 提高日志级别，查看详细信息
    }) as any,
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
