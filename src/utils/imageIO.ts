export type RasterFormat = 'png' | 'jpg'

export type LoadedRaster = {
  imageData: ImageData
  width: number
  height: number
  format: RasterFormat
}

function detectRasterFormat(file: File): RasterFormat {
  const mime = file.type.toLowerCase()
  const name = file.name.toLowerCase()

  if (mime === 'image/png' || name.endsWith('.png')) {
    return 'png'
  }

  if (mime === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')) {
    return 'jpg'
  }

  throw new Error('Неподдерживаемый формат. Используйте PNG или JPG.')
}

function 
loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Не удалось загрузить изображение'))
    }
    image.src = objectUrl
  })
}

export async function loadRasterFile(file: File): Promise<LoadedRaster> {
  const format = detectRasterFormat(file)
  const image = await loadHtmlImage(file)
  const width = image.naturalWidth
  const height = image.naturalHeight

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D недоступен')
  }

  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, width, height)

  return {
    imageData,
    width,
    height,
    format,
  }
}

export async function imageDataToBlob(
  imageData: ImageData,
  format: RasterFormat,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D недоступен')
  }

  ctx.putImageData(imageData, 0, 0)
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
  const quality = format === 'jpg' ? 0.92 : undefined

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Не удалось экспортировать изображение'))
          return
        }
        resolve(blob)
      },
      mimeType,
      quality,
    )
  })
}

export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
