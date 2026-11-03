import type { PreparedImage } from '../features/workspace/types'

const MAX_EDGE = 2200
const MAX_BYTES = 8 * 1024 * 1024

function isImage(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|bmp)$/i.test(file.name)
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('The image could not be encoded.'))
      },
      'image/jpeg',
      quality,
    )
  })
}

async function decodeImage(file: File): Promise<{
  source: CanvasImageSource
  width: number
  height: number
  cleanup: () => void
}> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    }
  } catch {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.src = url
    try {
      await image.decode()
    } catch {
      URL.revokeObjectURL(url)
      throw new Error('That photo could not be opened. Try a JPG, PNG, or WebP image.')
    }
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    }
  }
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!isImage(file)) {
    throw new Error('Choose an image file (JPG, PNG, or WebP).')
  }
  if (file.size > 40 * 1024 * 1024) {
    throw new Error('That photo is very large. Use a file under 40 MB.')
  }

  const decoded = await decodeImage(file)
  try {
    if (!decoded.width || !decoded.height) {
      throw new Error('That photo has no readable dimensions.')
    }
    if (decoded.width < 180 || decoded.height < 180) {
      throw new Error('That photo is too small to read. Use a larger image.')
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height))
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot prep images.')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.fillStyle = '#faf7f0'
    context.fillRect(0, 0, width, height)
    context.drawImage(decoded.source, 0, 0, width, height)

    let blob = await canvasToBlob(canvas, 0.9)
    if (blob.size > MAX_BYTES) blob = await canvasToBlob(canvas, 0.76)
    if (blob.size > MAX_BYTES) blob = await canvasToBlob(canvas, 0.62)

    const baseName = file.name.replace(/\.[^.]+$/, '').trim() || 'note'
    return {
      name: `${baseName}.jpg`,
      blob,
      previewUrl: URL.createObjectURL(blob),
      width,
      height,
    }
  } finally {
    decoded.cleanup()
  }
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (context.measureText(next).width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}

function drawPaperTexture(context: CanvasRenderingContext2D, width: number, height: number): void {
  let seed = 7
  const random = () => {
    seed = (seed * 16_807) % 2_147_483_647
    return seed / 2_147_483_647
  }
  context.save()
  for (let index = 0; index < 900; index += 1) {
    const x = random() * width
    const y = random() * height
    const length = 2 + random() * 18
    context.strokeStyle = `rgba(48, 42, 32, ${0.015 + random() * 0.03})`
    context.lineWidth = 0.6
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + length, y + random() * 1.4)
    context.stroke()
  }
  context.restore()
}

export async function createSampleFile(): Promise<File> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.load('600 68px "Caveat Variable"')
      await document.fonts.load('400 44px "Caveat Variable"')
      await document.fonts.ready
    } catch {
      // fall back to system fonts
    }
  }

  const width = 1200
  const height = 1600
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot draw the sample note.')

  context.fillStyle = '#f8f2e4'
  context.fillRect(0, 0, width, height)
  drawPaperTexture(context, width, height)

  context.strokeStyle = 'rgba(98, 116, 142, 0.2)'
  context.lineWidth = 1
  for (let y = 76; y < height; y += 58) {
    context.beginPath()
    context.moveTo(0, y + 0.5)
    context.lineTo(width, y + 0.5)
    context.stroke()
  }
  context.strokeStyle = 'rgba(198, 94, 73, 0.42)'
  context.lineWidth = 1.4
  context.beginPath()
  context.moveTo(68, 0)
  context.lineTo(68, height)
  context.stroke()

  const ink = '#25334f'
  const hand = '"Caveat Variable", "Bradley Hand", cursive'
  const serif = '"Newsreader Variable", Georgia, serif'

  context.fillStyle = ink
  context.font = `600 68px ${hand}`
  context.fillText('Field Notes — North Jetty', 100, 148)
  context.strokeStyle = 'rgba(214, 71, 43, 0.72)'
  context.lineWidth = 3
  context.beginPath()
  context.moveTo(104, 168)
  context.quadraticCurveTo(380, 176, 690, 165)
  context.stroke()

  context.font = `400 44px ${hand}`
  const paragraphOne = wrapText(
    context,
    'The tide came in earlier than the almanac predicted. I marked the high-water line with a blue peg near the north jetty.',
    940,
  )
  paragraphOne.slice(0, 4).forEach((line, index) => {
    context.fillText(line, 100, 278 + index * 52)
  })

  const paragraphTwo = wrapText(
    context,
    'Wind: SW, 12 knots. Visibility: good. Two oystercatchers on the rocks.',
    940,
  )
  paragraphTwo.slice(0, 3).forEach((line, index) => {
    context.fillText(line, 100, 478 + index * 52)
  })

  const list = [
    'Check salinity at 06:40',
    'Photograph erosion markers',
    'Ask Mara about the 1998 survey',
  ]
  list.forEach((line, index) => {
    const y = 676 + index * 62
    context.fillStyle = 'rgba(214, 71, 43, 0.9)'
    context.beginPath()
    context.arc(104, y - 13, 4, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = ink
    context.fillText(line, 126, y)
  })

  context.font = `italic 400 46px ${serif}`
  context.textAlign = 'center'
  context.fillText('h(t) = 2.4 + 0.8 sin(θ)', 600, 982)
  context.textAlign = 'left'

  const tableX = 112
  const tableY = 1090
  const tableWidth = 900
  const headerHeight = 54
  const rowHeight = 54
  context.strokeStyle = 'rgba(37, 51, 79, 0.6)'
  context.lineWidth = 1.3
  context.font = `600 38px ${hand}`
  context.fillStyle = ink
  context.fillText('Time', tableX + 24, tableY + 38)
  context.fillText('Height', tableX + 470, tableY + 38)
  for (let row = 0; row < 3; row += 1) {
    const y = tableY + headerHeight + row * rowHeight
    context.beginPath()
    context.moveTo(tableX, y)
    context.lineTo(tableX + tableWidth, y)
    context.stroke()
  }
  context.beginPath()
  context.moveTo(tableX, tableY)
  context.lineTo(tableX + tableWidth, tableY)
  context.moveTo(tableX, tableY)
  context.lineTo(tableX, tableY + headerHeight + rowHeight * 2)
  context.moveTo(tableX + 430, tableY)
  context.lineTo(tableX + 430, tableY + headerHeight + rowHeight * 2)
  context.moveTo(tableX + tableWidth, tableY)
  context.lineTo(tableX + tableWidth, tableY + headerHeight + rowHeight * 2)
  context.stroke()
  context.font = `400 40px ${hand}`
  context.fillText('06:00', tableX + 24, tableY + 92)
  context.fillText('2.1 m', tableX + 470, tableY + 92)
  context.fillText('12:00', tableX + 24, tableY + 146)
  context.fillText('3.2 m', tableX + 470, tableY + 146)

  context.font = `400 42px ${hand}`
  const followUp = wrapText(
    context,
    'Follow up: compare with the 2019 dataset and update the field log.',
    940,
  )
  followUp.slice(0, 2).forEach((line, index) => {
    context.fillText(line, 100, 1452 + index * 50)
  })

  const blob = await canvasToBlob(canvas, 0.9)
  return new File([blob], 'field-notes-sample.jpg', { type: 'image/jpeg' })
}
