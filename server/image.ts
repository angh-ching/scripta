import sharp from 'sharp'
import { AppError } from './errors'

export interface ProcessedImage {
  buffer: Buffer
  mimeType: 'image/jpeg'
  width: number
  height: number
}

const MAX_INPUT_PIXELS = 50_000_000
const MAX_EDGE = 2200

export async function processUploadedImage(input: Buffer): Promise<ProcessedImage> {
  if (!input || input.length < 64) {
    throw new AppError('INVALID_IMAGE', 'That file does not look like an image.', 400, false)
  }

  try {
    const image = sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error',
      animated: false,
    })
    const metadata = await image.metadata()

    if (!metadata.width || !metadata.height) {
      throw new AppError('INVALID_IMAGE', 'That image could not be opened.', 400, false)
    }
    if (metadata.width < 180 || metadata.height < 180) {
      throw new AppError(
        'INVALID_IMAGE',
        'The image is too small to read. Use a photo at least 180 px wide.',
        400,
        false,
      )
    }

    const { data, info } = await image
      .rotate()
      .flatten({ background: '#faf7f0' })
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })

    return {
      buffer: data,
      mimeType: 'image/jpeg',
      width: info.width,
      height: info.height,
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(
      'INVALID_IMAGE',
      'That image could not be read. Try a JPG, PNG, or WebP photo.',
      400,
      false,
    )
  }
}
