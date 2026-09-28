const MAX_EDGE = 1600
const MAX_RAW_BYTES = 12 << 20

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export async function shrinkImage(file: File): Promise<{ data: string; mime: string }> {
  const fallbackMime = file.type || 'application/octet-stream'
  if (!file.type.startsWith('image/') || /heic|heif/i.test(file.type) || /\.heic$/i.test(file.name)) {
    if (file.size > MAX_RAW_BYTES) {
      throw new Error('File is too large (max 12 MB on mobile)')
    }
    return { data: await readAsDataURL(file), mime: fallbackMime }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not decode image'))
      el.src = url
    }).catch(async () => {
      if (file.size > MAX_RAW_BYTES) {
        throw new Error('Photo is too large (max 12 MB on mobile)')
      }
      return null
    })
    if (!img) {
      return { data: await readAsDataURL(file), mime: fallbackMime }
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { data: canvas.toDataURL('image/jpeg', 0.85), mime: 'image/jpeg' }
  } finally {
    URL.revokeObjectURL(url)
  }
}
