const MAX_EDGE = 1600

export async function shrinkImage(file: File): Promise<{ data: string; mime: string }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
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
