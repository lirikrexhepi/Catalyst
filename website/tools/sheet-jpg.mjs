import sharp from 'sharp'
import fs from 'node:fs'

const [dir, prefix, outPrefix, cols = '3', per = '6', cellW = '640'] = process.argv.slice(2)
const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.jpg')).sort()
const cw = +cellW
const c = +cols
const n = +per
const probe = await sharp(`${dir}/${files[0]}`).metadata()
const ch = Math.round((cw * probe.height) / probe.width)
for (let s = 0; s * n < files.length; s++) {
  const group = files.slice(s * n, s * n + n)
  const rows = Math.ceil(group.length / c)
  const tiles = await Promise.all(
    group.map(async (f, i) => ({
      input: await sharp(`${dir}/${f}`).resize(cw, ch).toBuffer(),
      left: (i % c) * (cw + 6),
      top: Math.floor(i / c) * (ch + 6),
    })),
  )
  await sharp({ create: { width: c * (cw + 6), height: rows * (ch + 6), channels: 3, background: '#303030' } })
    .composite(tiles)
    .jpeg({ quality: 80 })
    .toFile(`${outPrefix}-${s}.jpg`)
}
console.log(files.length, 'files')
