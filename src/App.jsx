import { useCallback, useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import Element from './components/Element.jsx'

const SIZE = 1080
const SCALE = 0.5

let uid = 1

const INITIAL = [
  { id: uid++, type: 'rect', x: 240, y: 280, width: 600, height: 480, fill: '#111a2e', radius: 32 },
  { id: uid++, type: 'text', x: 240, y: 360, width: 600, height: 180, text: 'Design anything', fontSize: 72, fontWeight: '800', fontFamily: 'Segoe UI', fill: '#ffffff', align: 'center' },
  { id: uid++, type: 'text', x: 240, y: 560, width: 600, height: 80, text: 'Double-click to edit me ✨', fontSize: 32, fontWeight: '500', fontFamily: 'Segoe UI', fill: '#38bdf8', align: 'center' },
]

export default function App() {
  const [elements, setElements] = useState(INITIAL)
  const [selectedId, setSelectedId] = useState(null)
  const [bg, setBg] = useState('#f8fafc')
  const [exporting, setExporting] = useState(false)
  const [scale, setScale] = useState(SCALE)
  const [showProps, setShowProps] = useState(false)
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const dragRef = useRef(null)

  const selected = elements.find((e) => e.id === selectedId) || null

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

  // Drag & resize, driven by window-level pointer listeners.
  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current
      if (!d || !canvasRef.current) return
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
    const up = () => {
      dragRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
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

  const exportPng = async () => {
    if (!canvasRef.current || exporting) return
    setExporting(true)
    try {
      const url = await toPng(canvasRef.current, {
        width: SIZE,
        height: SIZE,
        pixelRatio: 1,
        cacheBust: true,
        style: { transform: 'none' },
      })
      const a = document.createElement('a')
      a.href = url
      a.download = 'design.png'
      a.click()
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">✦ Designly</div>
        <div className="actions">
          <label className="btn" style={{ cursor: 'pointer' }}>
            ⬆ Upload image
            <input type="file" accept="image/*" hidden onChange={onImageUpload} />
          </label>
          <button className="btn primary" onClick={exportPng} disabled={exporting}>
            {exporting ? 'Exporting…' : '⬇ Export PNG'}
          </button>
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
            Delete key removes · Export saves a 1080×1080 PNG.
          </p>
        </aside>
      </div>
    </div>
  )
}
