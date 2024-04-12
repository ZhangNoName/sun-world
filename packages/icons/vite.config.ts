/*
 * @Author: ZhangNoName
 * @Date: 2024-04-10 21:37:06
 * @LastEditors: zxy 1623190186@qq..com
 * @LastEditTime: 2024-04-11 22:49:24
 * @FilePath: \sun-world\packages\icons\vite.config.ts
 * @Description:
 *
 * Copyright (c) 2024 by ZhangNoName, All Rights Reserved.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import typescript from "@rollup/plugin-typescript";

import path from "path";

const resolvePath = (str: string) => path.resolve(__dirname, str);
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "icons",
      fileName: (format) => `icons.${format}.js`,
    },
    rollupOptions: {
      external: ["react", "react-dom"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
      plugins: [
        typescript({
          target: "esnext",
          rootDir: resolvePath("src"),
          declaration: true,
          declarationDir: resolvePath("dist"),
          exclude: resolvePath("node_modules/**"),
          allowSyntheticDefaultImports: true,
        }),
      ],
    },
  },
});
