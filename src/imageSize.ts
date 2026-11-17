interface ImageSize {
  width?: number
  height?: number
}

/** Explicit dimensions take precedence; automatic sizing never enlarges a small source. */
export function resolveImageSize(image: ImageSize, naturalWidth: number, naturalHeight: number) {
  const width = image.width || (image.height
    ? image.height * naturalWidth / naturalHeight
    : Math.min(200, naturalWidth))
  const height = image.height || width * naturalHeight / naturalWidth
  return { width, height }
}
