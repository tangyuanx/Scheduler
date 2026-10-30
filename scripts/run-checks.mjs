// 一键跑通：视图渲染冒烟 + 排期算法断言
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const esbuild = path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild')

execFileSync(
  process.execPath,
  [
    esbuild,
    path.join(root, 'scripts', 'ssr-check.jsx'),
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--packages=external',
    `--outfile=${path.join(root, 'scripts', '.ssr-check.cjs')}`,
    '--loader:.css=text',
    '--define:process.env.NODE_ENV="production"',
  ],
  { stdio: 'inherit', cwd: root },
)

execFileSync(process.execPath, [path.join(root, 'scripts', '.ssr-check.cjs')], { stdio: 'inherit', cwd: root })
