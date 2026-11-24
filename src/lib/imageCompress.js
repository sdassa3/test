// Client-side image compression — files never leave the device.

const EXT = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' }

export const isCompressibleImage = (file) =>
  /^(image\/(jpeg|png|webp|gif|bmp|avif))$/i.test(file.type)

export const isSvg = (file) =>
  file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)

async function decode(file) {
  // Prefer createImageBitmap (fast, handles EXIF orientation when supported).
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    try {
      return await createImageBitmap(file)
    } catch {
      return decodeViaImg(file)
    }
  }
}

function decodeViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read this image (format may be unsupported by this browser)'))
    }
    img.src = url
  })
}

function drawToCanvas(src, maxW) {
  let w = src.width
  let h = src.height
  if (maxW > 0 && w > maxW) {
    h = Math.max(1, Math.round(h * (maxW / w)))
    w = maxW
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  return { canvas, width: w, height: h }
}

function encode(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Encoding failed'))),
      type,
      quality,
    )
  })
}

// Pick the output mime for "Auto" mode — biased toward real size wins:
// keep jpg/webp as-is; png/gif/bmp/avif re-encode to webp (keeps transparency,
// dramatically smaller). Users who need a specific format pick it explicitly.
function autoMime() {
  return 'image/webp'
}

async function encodeOnce(canvas, mime, quality) {
  const blob = await encode(canvas, mime, quality)
  // Some browsers ignore the requested type — accept what we actually got.
  return { blob, mime: EXT[blob.type] ? blob.type : mime }
}

/**
 * Compress an image File.
 * opts: { mode: 'quality'|'target', quality: 1-100, targetKB: number,
 *         format: 'auto'|'image/jpeg'|'image/webp'|'image/png', maxWidth: 0|number }
 * Returns { blob, name, mime, width, height }.
 */
export async function compressImageFile(file, opts) {
  const src = await decode(file)
  try {
    let mime
    if (opts.format === 'auto') {
      mime = autoMime() // always WebP — best compression, keeps transparency
    } else {
      mime = opts.format
    }

    // PNG is lossless — a target size or a quality value can't be honored.
    // For target mode we transparently switch to WebP (keeps alpha).
    if (opts.mode === 'target' && mime === 'image/png') mime = 'image/webp'

    const { canvas, width, height } = drawToCanvas(src, opts.maxWidth || 0)

    let out
    if (opts.mode === 'target') {
      out = await compressToTarget(canvas, mime, Math.max(10, opts.targetKB) * 1024)
    } else {
      const q = Math.min(1, Math.max(0.05, opts.quality / 100))
      out = await encodeOnce(canvas, mime, q)
    }

    // Never hand back something bigger than what came in —
    // if the re-encode gained nothing, serve the original untouched.
    if (out.blob.size >= file.size) {
      const base = file.name.replace(/\.[^.]+$/, '') || 'image'
      return {
        blob: file,
        mime: file.type || 'application/octet-stream',
        name: file.name,
        width: src.width,
        height: src.height,
        originalKept: true,
      }
    }

    const ext = EXT[out.mime] || 'img'
    const base = file.name.replace(/\.[^.]+$/, '') || 'image'
    return { blob: out.blob, mime: out.mime, name: `${base}-min.${ext}`, width, height }
  } finally {
    if (src.close) src.close()
  }
}

// Binary-search the smallest quality that still fits the target size.
// Falls back to the best attempt found even if the target is unreachable.
async function compressToTarget(canvas, mime, targetBytes) {
  const q = async (v) => encodeOnce(canvas, mime, v)
  let lo = 0.05
  let hi = 0.95
  let best = await q(hi)
  if (best.blob.size <= targetBytes) return best
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2
    const attempt = await q(mid)
    if (attempt.blob.size <= targetBytes) {
      best = attempt
      lo = mid
    } else {
      hi = mid
    }
  }
  return best
}

/** Minify an SVG in-place (strips editor metadata, comments, blank text). */
export async function minifySvg(file) {
  const text = await file.text()
  let out = text
    .replace(/<\?xml-stylesheet[^>]*\?>\s*/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s(inkscape|sodipodi|xmlns:(inkscape|sodipodi)):[\w-]+="[^"]*"/g, '')
    .replace(/<(metadata|desc)[\s\S]*?<\/\1>\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
  if (!out.includes('<svg')) throw new Error('Not a valid SVG file')
  const base = file.name.replace(/\.svg$/i, '') || 'image'
  return {
    blob: new Blob([out], { type: 'image/svg+xml' }),
    name: `${base}-min.svg`,
  }
}
