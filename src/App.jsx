import { useCallback, useEffect, useRef, useState } from 'react'
import { toPng, toJpeg, toSvg, toCanvas } from 'html-to-image'
import Element from './components/Element.jsx'

const SIZE = 1080
const SCALE = 0.5
const STORAGE_KEY = 'designly.project'
let uid = 1

const INITIAL = [
  { id: uid++, type: 'rect', x: 240, y: 280, width: 600, height: 480, fill: '#111a2e', radius: 32 },
  { id: uid++, type: 'text', x: 240, y: 360, width: 600, height: 180, text: 'Design anything', fontSize: 72, fontWeight: '800', fontFamily: 'Segoe UI', fill: '#ffffff', align: 'center' },
  { id: uid++, type: 'text', x: 240, y: 560, width: 600, height: 80, text: 'Double-click to edit me ✨', fontSize: 32, fontWeight: '500', fontFamily: 'Segoe UI', fill: '#38bdf8', align: 'center' },
]

// Read a previously saved project from this browser's storage.
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.elements)) return null
    return data
  } catch {
    return null
  }
}

function download(url, name) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
}

export default function App() {
  const saved = useRef(loadSaved())
  const [elements, setElements] = useState(saved.current?.elements ?? INITIAL)
  const [selectedId, setSelectedId] = useState(null)
  const [bg, setBg] = useState(saved.current?.background ?? '#f8fafc')
  const [showDonate, setShowDonate] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [savedFlash, setSavedFlash] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [unsaved, setUnsaved] = useState(false)
  const [scale, setScale] = useState(SCALE)
  const [showProps, setShowProps] = useState(false)
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const dragRef = useRef(null)

  const selected = elements.find((e) => e.id === selectedId) || null

  // Keep the highest element id ahead of restored projects.
  useEffect(() => {
    const maxId = elements.reduce((m, e) => Math.max(m, e.id), 0)
    if (maxId >= uid) uid = maxId + 1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track unsaved changes: anything after the first render counts as an
  // edit; loading a project file or starting fresh resets the flag.
  const firstRender = useRef(true)
  const skipDirty = useRef(false)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (skipDirty.current) {
      skipDirty.current = false
      return
    }
    setUnsaved(true)
  }, [elements, bg])

  // Warn before leaving/refreshing with unsaved changes (native browser dialog).
  useEffect(() => {
    if (!unsaved) return
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = '' // required by Chrome/Edge
      return ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  // Persist the project locally after every change (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ elements, background: bg, savedAt: Date.now() }))
      } catch {
        /* storage full — ignore */
      }
    }, 400)
    return () => clearTimeout(t)
  }, [elements, bg])

  // Fit the canvas to the available space (phones get a smaller scale).
  useEffect(() => {
    const fit = () => {
      const el = stageRef.current
      if (!el) return
      const s = Math.min((el.clientWidth - 20) / SIZE, (el.clientHeight - 20) / SIZE, 0.6)
      setScale(Math.max(0.15, s))
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (stageRef.current) ro.observe(stageRef.current)
    window.addEventListener('resize', fit)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [])

  const update = useCallback((id, patch) => {
    setElements((els) => els.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }, [])

  const add = (type, extra = {}) => {
    const base = { id: uid++, x: 340, y: 390, width: 400, height: 400, fill: '#38bdf8' }
    if (type === 'text') Object.assign(base, { type, x: 240, y: 480, width: 600, height: 120, text: 'Your text here', fontSize: 56, fontWeight: '700', fontFamily: 'Segoe UI', fill: '#111a2e', align: 'center' })
    if (type === 'rect') Object.assign(base, { type, height: 300, fill: '#818cf8', radius: 16 })
    if (type === 'circle') Object.assign(base, { type })
    if (type === 'triangle') Object.assign(base, { type, fill: '#f472b6' })
    if (type === 'line') Object.assign(base, { type, y: 580, height: 8, fill: '#e2e8f0' })
    if (type === 'image') Object.assign(base, { type, src: extra.src, fill: 'transparent' })
    setElements((els) => [...els, base])
    setSelectedId(base.id)
    setShowProps(true)
  }

  // Drag & resize, throttled with requestAnimationFrame for smooth mobile
  // performance: at most one state update per frame.
  useEffect(() => {
    let raf = 0
    let lastEvent = null
    const apply = () => {
      raf = 0
      const e = lastEvent
      lastEvent = null
      const d = dragRef.current
      if (!e || !d || !canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      if (d.mode === 'drag') {
        const x = Math.round((e.clientX - rect.left) / scale - d.dx)
        const y = Math.round((e.clientY - rect.top) / scale - d.dy)
        update(d.id, {
          x: Math.max(-200, Math.min(SIZE, x)),
          y: Math.max(-200, Math.min(SIZE, y)),
        })
      } else {
        const w = Math.max(20, Math.round(d.w + (e.clientX - d.sx) / scale))
        const h = Math.max(20, Math.round(d.h + (e.clientY - d.sy) / scale))
        update(d.id, { width: Math.min(SIZE * 2, w), height: Math.min(SIZE * 2, h) })
      }
    }
    const move = (e) => {
      lastEvent = e
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const up = () => {
      dragRef.current = null
      lastEvent = null
      if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [update, scale])

  // Keyboard: delete removes selected element, escape deselects. Skip on
  // touch devices where Delete/Backspace is not meaningful.
  useEffect(() => {
    const key = (e) => {
      if (selectedId == null) return
      const t = e.target
      if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        setElements((els) => els.filter((el) => el.id !== selectedId))
        setSelectedId(null)
      }
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [selectedId])

  // Deselect when tapping the stage background (touch-friendly).
  const onStagePointerDown = (e) => {
    if (e.target === e.currentTarget || e.target.classList.contains('canvas-wrap')) {
      setSelectedId(null)
      setShowProps(false)
    }
  }

  const onImageUpload = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => add('image', { src: reader.result })
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const flash = (msg) => {
    setSavedFlash(msg)
    setTimeout(() => setSavedFlash(''), 1800)
  }

  // Render the canvas to a bitmap at the requested pixel size.
  const renderDataUrl = async (type, quality) => {
    if (!canvasRef.current) throw new Error('no canvas')
    const opts = {
      width: SIZE,
      height: SIZE,
      pixelRatio: 1,
      cacheBust: true,
      style: { transform: 'none' },
    }
    if (type === 'image/png') return toPng(canvasRef.current, opts)
    if (type === 'image/jpeg') return toJpeg(canvasRef.current, { ...opts, quality, backgroundColor: bg })
    if (type === 'image/webp') return toCanvas(canvasRef.current, opts).then((c) => c.toDataURL('image/webp', quality))
    return toSvg(canvasRef.current, opts)
  }

  const EXPORTS = {
    png: { label: 'PNG image', mime: 'image/png', ext: 'png' },
    jpeg: { label: 'JPEG image', mime: 'image/jpeg', ext: 'jpg' },
    webp: { label: 'WebP image', mime: 'image/webp', ext: 'webp' },
    svg: { label: 'SVG vector', mime: 'image/svg+xml', ext: 'svg' },
  }

  const exportAs = async (key) => {
    if (!canvasRef.current || exporting) return
    const fmt = EXPORTS[key]
    if (!fmt) return
    setExporting(true)
    try {
      const url = await renderDataUrl(fmt.mime)
      download(url, `design.${fmt.ext}`)
      flash(`Exported ${fmt.label} ✓`)
    } catch {
      flash('Export failed ✕')
    } finally {
      setExporting(false)
    }
  }

  // Save the design to the user's device as an editable project file.
  const saveProject = () => {
    const data = { app: 'designly', version: 1, background: bg, elements }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    download(url, 'design.designly.json')
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    setUnsaved(false)
    flash('Saved to device ✓')
  }

  // Load a saved project file back into the editor.
  const loadProjectFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        if (!data || !Array.isArray(data.elements)) throw new Error('bad file')
        skipDirty.current = true
        setElements(data.elements)
        if (typeof data.background === 'string') setBg(data.background)
        setSelectedId(null)
        setShowProps(false)
        setUnsaved(false)
        flash('Design loaded ✓')
      } catch {
        flash('Invalid project file ✕')
      }
    }
    reader.readAsText(file)
  }

  const importJson = (e) => {
    loadProjectFile(e.target.files?.[0])
    e.target.value = ''
  }

  // Drag & drop a saved project file anywhere to reopen it.
  const onDropProject = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.name.endsWith('.json'))
    if (file) loadProjectFile(file)
  }

  // Native share sheet on phones; falls back to a PNG download.
  const sharePng = async () => {
    if (!canvasRef.current || exporting) return
    setExporting(true)
    try {
      const url = await renderDataUrl('image/png')
      const blob = await (await fetch(url)).blob()
      const file = new File([blob], 'design.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My design' })
      } else {
        download(url, 'design.png')
      }
    } catch {
      /* user cancelled share */
    } finally {
      setExporting(false)
    }
  }

  const newProject = () => {
    if (!confirm('Start a new empty design? Unsaved work in this browser stays until you overwrite it.')) return
    skipDirty.current = true
    setElements([])
    setSelectedId(null)
    setBg('#f8fafc')
    setUnsaved(false)
    flash('New project ✓')
  }

  // ---- Microsoft Office exports ----
  // PowerPoint: one slide containing the design as a full-bleed image.
  const exportPptx = async () => {
    if (!canvasRef.current || exporting) return
    setExporting(true)
    try {
      const url = await renderDataUrl('image/png')
      const { default: PptxGenJS } = await import('pptxgenjs')
      const pptx = new PptxGenJS()
      pptx.defineLayout({ name: 'SQUARE', width: 10, height: 10 })
      pptx.layout = 'SQUARE'
      const slide = pptx.addSlide()
      slide.addImage({ data: url, x: 0, y: 0, w: 10, h: 10 })
      const blob = await pptx.write({ outputType: 'blob' })
      const objUrl = URL.createObjectURL(blob)
      download(objUrl, 'design.pptx')
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000)
      flash('PowerPoint saved ✓')
    } catch {
      flash('PowerPoint export failed ✕')
    } finally {
      setExporting(false)
    }
  }

  // PDF: A4 page with the design embedded as a full image.
  const exportPdf = async () => {
    if (!canvasRef.current || exporting) return
    setExporting(true)
    try {
      const url = await renderDataUrl('image/png')
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      // Fit the square design inside the page with a small margin.
      const margin = 24
      const size = Math.min(pageW, pageH) - margin * 2
      const x = (pageW - size) / 2
      const y = (pageH - size) / 2
      pdf.addImage(url, 'PNG', x, y, size, size)
      pdf.save('design.pdf')
      flash('PDF saved ✓')
    } catch {
      flash('PDF export failed ✕')
    } finally {
      setExporting(false)
    }
  }

  // Word: document with the design image plus editable text elements.
  const exportDocx = async () => {
    if (!canvasRef.current || exporting) return
    setExporting(true)
    try {
      const url = await renderDataUrl('image/png')
      const blob = await (await fetch(url)).blob()
      const { Document, Packer, Paragraph, ImageRun, TextRun, HeadingLevel } = await import('docx')
      const children = [
        new Paragraph({
          children: [
            new ImageRun({
              data: blob,
              transformation: { width: 400, height: 400 },
              type: 'png',
            }),
          ],
        }),
        new Paragraph({ text: '' }),
        new Paragraph({ text: 'Design text:', headingLevel: HeadingLevel.HEADING_2 }),
        ...elements
          .filter((el) => el.type === 'text')
          .map(
            (el) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text: el.text || '',
                    bold: Number(el.fontWeight) >= 700,
                    size: Math.round((el.fontSize || 24) * 1.6),
                    color: (el.fill || '#111111').replace('#', ''),
                  }),
                ],
              }),
          ),
      ]
      const doc = new Document({ sections: [{ children }] })
      const out = await Packer.toBlob(doc)
      const objUrl = URL.createObjectURL(out)
      download(objUrl, 'design.docx')
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000)
      flash('Word saved ✓')
    } catch {
      flash('Word export failed ✕')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      className={`app${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (e.dataTransfer?.types?.includes('Files')) setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false)
      }}
      onDrop={onDropProject}
    >
      {dragOver && <div className="drop-overlay">📥 Drop your .json design file to open it</div>}
      <header className="topbar">
        <div className="logo">✦ Designly</div>
        {savedFlash && <span className="flash">{savedFlash}</span>}
        <div className="actions">
          <label className="btn" style={{ cursor: 'pointer' }}>
            ⬆ Image
            <input type="file" accept="image/*" hidden onChange={onImageUpload} />
          </label>
          <label className="btn" style={{ cursor: 'pointer' }}>
            📂 Open
            <input type="file" accept=".json,application/json" hidden onChange={importJson} />
          </label>
          <button className="btn" onClick={saveProject} title="Download the editable design file to your device">
            💾 Save{unsaved && <span className="unsaved-dot" />}
          </button>
          <button className="btn donate" onClick={() => setShowDonate(true)}>❤ Donate</button>
          <div className="menu-wrap">
            <button className="btn primary" disabled={exporting}>
              {exporting ? '…' : '⬇ Export'}
            </button>
            <div className="menu">
              {Object.entries(EXPORTS).map(([key, fmt]) => (
                <button key={key} className="menu-item" onClick={() => exportAs(key)}>
                  {fmt.label} <span className="ext">.{fmt.ext}</span>
                </button>
              ))}
              <div className="menu-sep" />
              <button className="menu-item" onClick={exportPptx}>PowerPoint <span className="ext">.pptx</span></button>
              <button className="menu-item" onClick={exportDocx}>Word <span className="ext">.docx</span></button>
              <button className="menu-item" onClick={exportPdf}>PDF document <span className="ext">.pdf</span></button>
              <div className="menu-sep" />
              <button className="menu-item" onClick={saveProject}>💾 Project file <span className="ext">.json</span></button>
              <button className="menu-item" onClick={sharePng}>📤 Share (phone)</button>
              <button className="menu-item danger-item" onClick={newProject}>🆕 New design</button>
            </div>
          </div>
        </div>
      </header>

      <div className="main">
        <aside className="toolbar">
          <button className="tool" onClick={() => add('text')}><span className="t-icon">T</span>Text</button>
          <button className="tool" onClick={() => add('rect')}><span className="t-icon">▭</span>Rect</button>
          <button className="tool" onClick={() => add('circle')}><span className="t-icon">●</span>Circle</button>
          <button className="tool" onClick={() => add('triangle')}><span className="t-icon">▲</span>Tri</button>
          <button className="tool" onClick={() => add('line')}><span className="t-icon">─</span>Line</button>
          <button className="tool mobile-only" onClick={() => setShowProps(true)}><span className="t-icon">⚙</span>Props</button>
        </aside>

        <main className="stage" ref={stageRef} onPointerDown={onStagePointerDown}>
          <div className="canvas-wrap" style={{ width: SIZE * scale, height: SIZE * scale }}>
            <div
              ref={canvasRef}
              className={`canvas${exporting ? ' exporting' : ''}`}
              style={{ background: bg, transform: `scale(${scale})` }}
            >
              {elements.map((el) => (
                <Element
                  key={el.id}
                  el={el}
                  selected={el.id === selectedId}
                  onSelect={setSelectedId}
                  onChange={(patch) => update(el.id, patch)}
                  onDragStart={(e, target) => {
                    const rect = canvasRef.current.getBoundingClientRect()
                    dragRef.current = {
                      mode: 'drag',
                      id: target.id,
                      dx: (e.clientX - rect.left) / scale - target.x,
                      dy: (e.clientY - rect.top) / scale - target.y,
                    }
                  }}
                  onResizeStart={(e, target) => {
                    dragRef.current = {
                      mode: 'resize',
                      id: target.id,
                      sx: e.clientX,
                      sy: e.clientY,
                      w: target.width,
                      h: target.height,
                    }
                  }}
                />
              ))}
            </div>
          </div>
        </main>

        <aside className={`props${showProps ? ' open' : ''}`}>
          {selected ? (
            <>
              <div className="props-head">
                <h3>{selected.type} properties</h3>
                <button className="close-props" onClick={() => setShowProps(false)}>✕</button>
              </div>
              <div className="field">
                <label>Color</label>
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(selected.fill) ? selected.fill : '#ffffff'}
                  onChange={(e) => update(selected.id, { fill: e.target.value })}
                />
              </div>
              {selected.type === 'text' && (
                <>
                  <div className="field">
                    <label>Font size</label>
                    <input
                      type="number"
                      min="8"
                      max="300"
                      value={selected.fontSize}
                      onChange={(e) => update(selected.id, { fontSize: +e.target.value || 16 })}
                    />
                  </div>
                  <div className="field">
                    <label>Weight</label>
                    <select
                      value={selected.fontWeight}
                      onChange={(e) => update(selected.id, { fontWeight: e.target.value })}
                    >
                      {['300', '400', '500', '600', '700', '800', '900'].map((w) => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Align</label>
                    <select
                      value={selected.align || 'center'}
                      onChange={(e) => update(selected.id, { align: e.target.value })}
                    >
                      {['left', 'center', 'right'].map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              {selected.type === 'rect' && (
                <div className="field">
                  <label>Corner radius</label>
                  <input
                    type="number"
                    min="0"
                    max="200"
                    value={selected.radius || 0}
                    onChange={(e) => update(selected.id, { radius: +e.target.value || 0 })}
                  />
                </div>
              )}
              <div className="row">
                <button
                  className="btn"
                  onClick={() => {
                    setElements((els) => [...els.filter((x) => x.id !== selected.id), selected])
                  }}
                >
                  ⤒ Front
                </button>
                <button
                  className="btn danger"
                  onClick={() => {
                    setElements((els) => els.filter((x) => x.id !== selected.id))
                    setSelectedId(null)
                  }}
                >
                  🗑 Delete
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="props-head">
                <h3>Canvas</h3>
                <button className="close-props" onClick={() => setShowProps(false)}>✕</button>
              </div>
              <div className="field">
                <label>Background</label>
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
              </div>
              <p className="empty">
                Select an element to edit its properties, or add one from the left toolbar.
              </p>
            </>
          )}
          <p className="hint">
            💡 Drag to move · corner handle to resize · double-click text to edit ·
            Delete key removes · Exports save 1080×1080 · Work auto-saves in this browser.
          </p>
        </aside>
      </div>

      {showDonate && (
        <div className="modal-backdrop" onClick={() => setShowDonate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowDonate(false)}>✕</button>
            <div className="donate-heart">❤</div>
            <h2>Support Designly</h2>
            <p className="donate-sub">
              Designly is free, has no ads, and runs entirely in your browser.
              If it helps you make things you love, a small donation keeps it that way 💙
            </p>
            <div className="donate-methods">
              <a
                className="donate-btn paypal"
                href="https://www.paypal.com/paypalme/mialstudio"
                target="_blank"
                rel="noreferrer"
              >
                PayPal
              </a>
              <a
                className="donate-btn kofi"
                href="https://ko-fi.com/mialstudio"
                target="_blank"
                rel="noreferrer"
              >
                Ko-fi
              </a>
              <a
                className="donate-btn btc"
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  navigator.clipboard?.writeText('bc1qexampleaddressreplace0withyourswallet')
                  alert('Bitcoin address copied — paste it in your wallet app.')
                }}
              >
                ₿ Bitcoin
              </a>
            </div>
            <p className="donate-note">You are testing the donate feature — payments are not live yet.</p>
          </div>
        </div>
      )}
    </div>
  )
}
