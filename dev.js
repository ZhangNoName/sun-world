const { context } = require('esbuild')
const args = require('minimist')(process.argv.slice(2))
const path = require('path')
const { sassPlugin } = require('esbuild-sass-plugin')
const vuePlugin = require('esbuild-plugin-vue3') // 引入 vue 插件

const setup = async () => {
  const target = args._[0]
  if (!target) {
    console.log('Please specify a target package')
    return
  }
  console.log('target', target)
  const pkgJson = require(path.resolve(
    __dirname,
    `../packages/${target}/package.json`
  ))

  const outfile = path.resolve(
    __dirname,
    `../packages/${target}/dist/${target}.es.js`
  )
  const relativeOutputFile = path.relative(process.cwd(), outfile)
  console.log('outfile', outfile)

  /** @type {import('esbuild').BuildContext} */
  const ctx = await context({
    entryPoints: [
      path.resolve(__dirname, `../packages/${target}/src/index.ts`),
    ],
    outfile,
    bundle: true,
    external: Object.keys({
      ...pkgJson.dependencies,
      ...pkgJson.peerDependencies,
      ...pkgJson.devDependencies,
    }).filter((dep) => !dep.startsWith('@sun-world')),
    sourcemap: true,
    format: 'esm',
    platform: 'browser',
    plugins: [
      vuePlugin(), // 添加 vue 插件
      {
        name: 'watch-build',
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length) {
              console.error('build failed:', result.errors)
            } else {
              console.log('watch build succeeded:', relativeOutputFile)
            }
          })
        },
      },
    ],
  })

  await ctx.watch()
}

setup()
