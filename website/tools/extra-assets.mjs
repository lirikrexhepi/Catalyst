import sharp from 'sharp'

const root = '../../'
await sharp(`${root}desktop/frontend/src/assets/wallpapers/wallpaper2.jpg`).resize({ width: 2400 }).webp({ quality: 78 }).toFile('../assets/bg-dusk.webp')
await sharp(`${root}desktop/frontend/src/assets/wallpapers/wallpaper4.jpg`).resize({ width: 2400 }).webp({ quality: 78 }).toFile('../assets/bg-dunes.webp')
await sharp(`${root}assets/logo/app-icon-blue-base.png`).resize(256).png().toFile('../assets/icon-256.png')
await sharp(`${root}assets/logo/app-icon-blue-base.png`).resize(180).png().toFile('../assets/apple-touch-icon.png')
await sharp(`${root}assets/logo/app-icon-blue-base.png`).resize(48).png().toFile('../assets/favicon.png')
await sharp('../shots/raw/desktop-deck-hero.png')
  .extract({ left: 0, top: 144, width: 2880, height: 1512 })
  .resize(1200, 630)
  .jpeg({ quality: 86 })
  .toFile('../assets/og.jpg')
console.log('ok')
