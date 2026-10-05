import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const raw = '../shots/raw'
const out = '../assets/shots'
fs.mkdirSync(out, { recursive: true })

const esbuild = path.resolve('../../frontend/node_modules/.bin/esbuild.cmd')
execFileSync(esbuild, ['kit.ts', '--bundle', '--minify', '--format=esm', '--outfile=../js/kit.js', '--target=es2020'], { stdio: 'inherit', shell: true })

const jobs = []
for (const file of fs.readdirSync(raw)) {
  if (!file.endsWith('.png')) continue
  const name = file.replace('.png', '')
  const isDesktop = name.startsWith('desktop-')
  const widths = isDesktop ? [2000, 1000] : [780, 390]
  for (const w of widths) {
    jobs.push(
      sharp(path.join(raw, file))
        .resize({ width: w })
        .webp({ quality: isDesktop ? 82 : 86, effort: 5 })
        .toFile(path.join(out, `${name}-${w}.webp`)),
    )
  }
}
await Promise.all(jobs)
const sizes = fs.readdirSync(out).map((f) => `${f} ${(fs.statSync(path.join(out, f)).size / 1024).toFixed(0)}KB`)
console.log(sizes.join('\n'))
