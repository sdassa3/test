// Arbitrary-file compression (ZIP with max deflate) — fully in-browser via fflate.
import { zip } from 'fflate'

const MAX_INPUT_BYTES = 500 * 1024 * 1024 // 500 MB — browsers run out of memory beyond this

export function canCompressFile(file) {
  return file.size <= MAX_INPUT_BYTES
}

/** Zip a single file at level 9. Returns a Blob (.zip). */
export function zipFileToBlob(file) {
  if (!canCompressFile(file)) {
    return Promise.reject(new Error('File is too large for in-browser compression (max 500 MB)'))
  }
  return file.arrayBuffer().then((buf) =>
    new Promise((resolve, reject) => {
      zip({ [file.name]: new Uint8Array(buf) }, { level: 9 }, (err, out) =>
        err ? reject(err) : resolve(new Blob([out], { type: 'application/zip' })),
      )
    }),
  )
}

/** Zip several result blobs into one archive for "Download all". */
export async function zipBlobs(entries) {
  // entries: [{ name, blob }]
  const data = {}
  const used = new Set()
  for (const e of entries) {
    let name = e.name
    let n = 2
    while (used.has(name)) {
      const dot = e.name.lastIndexOf('.')
      name = dot > 0 ? `${e.name.slice(0, dot)} (${n})${e.name.slice(dot)}` : `${e.name} (${n})`
      n++
    }
    used.add(name)
    data[name] = new Uint8Array(await e.blob.arrayBuffer())
  }
  return new Promise((resolve, reject) => {
    zip(data, { level: 6 }, (err, out) =>
      err ? reject(err) : resolve(new Blob([out], { type: 'application/zip' })),
    )
  })
}
