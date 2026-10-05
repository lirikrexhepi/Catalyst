import sharp from 'sharp'
import fs from 'node:fs'

const [dir, prefix, out, cols = '2', cellW = '960'] = process.argv.slice(2)
const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.png')).sort()
const cw = +cellW
const probe = await sharp(`${dir}/${files[0]}`).metadata()
const ch = Math.round((cw * probe.height) / probe.width)
const c = +cols
const rows = Math.ceil(files.length / c)
const tiles = await Promise.all(
  files.map(async (f, i) => ({
    input: await sharp(`${dir}/${f}`).resize(cw, ch).toBuffer(),
    left: (i % c) * (cw + 8),
    top: Math.floor(i / c) * (ch + 8),
  })),
)
await sharp({ create: { width: c * (cw + 8), height: rows * (ch + 8), channels: 3, background: '#222' } })
  .composite(tiles)
  .jpeg({ quality: 82 })
  .toFile(out)
console.log(files.join(','))
