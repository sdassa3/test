import { useCallback, useEffect, useRef, useState } from 'react'
import {
  compressImageFile,
  isCompressibleImage,
  isSvg,
  minifySvg,
} from './lib/imageCompress.js'
import { canCompressFile, zipBlobs, zipFileToBlob } from './lib/fileCompress.js'

const fmtBytes = (b) => {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

const savedPct = (before, after) =>
  before > 0 ? Math.max(0, Math.round((1 - after / before) * 100)) : 0

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export default function App() {
  const [mode, setMode] = useState('image') // 'image' | 'file'
  const [imgMode, setImgMode] = useState('quality') // 'quality' | 'target'
  const [quality, setQuality] = useState(75)
  const [targetKB, setTargetKB] = useState(200)
  const [format, setFormat] = useState('auto')
  const [maxWidth, setMaxWidth] = useState(0)
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)
  const uidRef = useRef(1)
  const settingsRef = useRef({})

  settingsRef.current = { mode, imgMode, quality, targetKB, format, maxWidth }

  const processFiles = useCallback(async (fileList) => {
    const files = [...fileList]
    if (!files.length) return
    setBusy(true)
    for (const f of files) {
      const s = settingsRef.current
      const id = uidRef.current++
      setResults((r) => [
        ...r,
        { id, name: f.name, before: f.size, after: 0, status: 'working', blob: null },
      ])
      try {
        let out
        if (s.mode === 'image') {
          if (isSvg(f)) {
            out = await minifySvg(f)
          } else if (isCompressibleImage(f)) {
            out = await compressImageFile(f, {
              mode: s.imgMode,
              quality: s.quality,
              targetKB: s.targetKB,
              format: s.format,
              maxWidth: s.maxWidth,
            })
          } else {
            throw new Error('Not an image — switch to the "Any file" tab to ZIP it')
          }
        } else {
          if (!canCompressFile(f)) {
            throw new Error('Too large for in-browser compression (max 500 MB)')
          }
          const blob = await zipFileToBlob(f)
          const base = f.name.replace(/\.[^.]+$/, '') || 'file'
          out = { blob, name: `${base}.zip` }
        }
        setResults((r) =>
          r.map((it) =>
            it.id === id
              ? {
                  ...it,
                  status: 'done',
                  after: out.blob.size,
                  blob: out.blob,
                  outName: out.name,
                  url: URL.createObjectURL(out.blob),
                  dims: out.width ? `${out.width}×${out.height}` : null,
                }
              : it,
          ),
        )
      } catch (e) {
        setResults((r) =>
          r.map((it) =>
            it.id === id
              ? { ...it, status: 'error', error: e?.message || String(e) }
              : it,
          ),
        )
      }
    }
    setBusy(false)
  }, [])

  // Drag & drop anywhere on the page.
  useEffect(() => {
    const over = (e) => {
      e.preventDefault()
      setDragOver(true)
    }
    const leave = (e) => {
      if (e.relatedTarget === null) setDragOver(false)
    }
    const drop = (e) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer?.files?.length) processFiles(e.dataTransfer.files)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [processFiles])

  const clearAll = () => {
    results.forEach((r) => r.url && URL.revokeObjectURL(r.url))
    setResults([])
  }

  const doneItems = results.filter((r) => r.status === 'done' && r.blob)
  const totals = doneItems.reduce(
    (acc, r) => ({ before: acc.before + r.before, after: acc.after + r.after }),
    { before: 0, after: 0 },
  )

  const downloadAll = async () => {
    if (!doneItems.length || zipping) return
    setZipping(true)
    try {
      const blob = await zipBlobs(doneItems.map((r) => ({ name: r.outName, blob: r.blob })))
      triggerDownload(blob, 'compressed-files.zip')
    } catch {
      /* ignore */
    } finally {
      setZipping(false)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">⚡</span>
          <div>
            <h1>TinyPress</h1>
            <p className="tagline">Shrink images &amp; files — right in your browser</p>
          </div>
        </div>
        <div className="mode-tabs" role="tablist">
          <button
            className={`tab ${mode === 'image' ? 'active' : ''}`}
            onClick={() => setMode('image')}
          >
            🖼 Images
          </button>
          <button
            className={`tab ${mode === 'file' ? 'active' : ''}`}
            onClick={() => setMode('file')}
          >
            📦 Any file
          </button>
        </div>
      </header>

      {mode === 'image' && (
        <section className="settings">
          <div className="seg">
            <button
              className={`seg-btn ${imgMode === 'quality' ? 'active' : ''}`}
              onClick={() => setImgMode('quality')}
            >
              Quality %
            </button>
            <button
              className={`seg-btn ${imgMode === 'target' ? 'active' : ''}`}
              onClick={() => setImgMode('target')}
            >
              Target size
            </button>
          </div>

          {imgMode === 'quality' ? (
            <div className="field slider-field">
              <label>
                Quality <strong>{quality}%</strong>
              </label>
              <input
                type="range"
                min="5"
                max="100"
                value={quality}
                style={{ '--fill': `${((quality - 5) / 95) * 100}%` }}
                onChange={(e) => setQuality(+e.target.value)}
              />
            </div>
          ) : (
            <div className="field">
              <label>Target size per image</label>
              <div className="target-input">
                <input
                  type="number"
                  min="10"
                  max="20000"
                  value={targetKB}
                  onChange={(e) => setTargetKB(Math.max(10, +e.target.value || 10))}
                />
                <span>KB</span>
              </div>
            </div>
          )}

          <div className="field">
            <label>Format</label>
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="auto">Auto (recommended)</option>
              <option value="image/jpeg">JPEG</option>
              <option value="image/webp">WebP</option>
              <option value="image/png">PNG</option>
            </select>
          </div>

          <div className="field">
            <label>Max width</label>
            <select value={maxWidth} onChange={(e) => setMaxWidth(+e.target.value)}>
              <option value={0}>Original</option>
              <option value={3840}>4K · 3840px</option>
              <option value={1920}>Full HD · 1920px</option>
              <option value={1080}>1080px</option>
              <option value={800}>800px</option>
            </select>
          </div>
        </section>
      )}

      {mode === 'file' && (
        <section className="settings file-note">
          <p>
            📦 Any file type — documents, videos, archives… — gets packed into a{' '}
            <strong>maximum-compression ZIP</strong>. Already-compressed files (ZIP, MP4,
            JPG…) shrink little or not at all.
          </p>
        </section>
      )}

      <section
        className={`dropzone ${dragOver ? 'over' : ''} ${results.length ? 'compact' : ''}`}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={mode === 'image' ? 'image/*' : undefined}
          onChange={(e) => {
            if (e.target.files?.length) processFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <div className="dz-icon">{dragOver ? '📥' : mode === 'image' ? '🖼' : '📦'}</div>
        <p className="dz-main">
          {dragOver ? 'Drop to compress!' : 'Drop files here — or tap to choose'}
        </p>
        <p className="dz-sub">
          {mode === 'image'
            ? 'JPG · PNG · WebP · GIF · BMP · SVG — multiple files OK'
            : 'Any type, up to 500 MB per file'}
        </p>
      </section>

      {dragOver && <div className="drop-overlay">📥 Drop to compress</div>}

      {(busy || results.length > 0) && (
        <section className="results">
          <div className="results-head">
            <h2>
              Results
              {totals.before > 0 && (
                <span className="total-saved">
                  {' '}
                  · {fmtBytes(totals.before)} → {fmtBytes(totals.after)} (
                  {savedPct(totals.before, totals.after)}% smaller)
                </span>
              )}
            </h2>
            <div className="results-actions">
              {doneItems.length > 1 && (
                <button className="btn primary" onClick={downloadAll} disabled={zipping}>
                  {zipping ? 'Zipping…' : `⬇ Download all (${doneItems.length})`}
                </button>
              )}
              <button className="btn" onClick={clearAll} disabled={busy}>
                Clear
              </button>
            </div>
          </div>

          <ul className="file-list">
            {results.map((r) => (
              <li key={r.id} className={`file-row ${r.status}`}>
                <div className="file-info">
                  <span className="file-name" title={r.name}>
                    {r.name}
                  </span>
                  <span className="file-meta">
                    {r.status === 'working' && '⏳ Compressing…'}
                    {r.status === 'error' && <span className="err">{r.error}</span>}
                    {r.status === 'done' && (
                      <>
                        {fmtBytes(r.before)} → <strong>{fmtBytes(r.after)}</strong>
                        {r.dims && <span className="dims"> · {r.dims}</span>}
                        {savedPct(r.before, r.after) > 0 ? (
                          <span className="saved"> −{savedPct(r.before, r.after)}%</span>
                        ) : (
                          <span className="nosave"> (already optimal)</span>
                        )}
                      </>
                    )}
                  </span>
                </div>
                {r.status === 'done' && (
                  <button
                    className="btn small primary"
                    onClick={() => triggerDownload(r.blob, r.outName)}
                  >
                    ⬇ Save
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="foot">
        <p>
          🔒 100% private — files are compressed on your device and never uploaded.
          Free forever.
        </p>
      </footer>
    </div>
  )
}
