import { useEffect, useRef } from 'react'

export default function Element({ el, selected, onSelect, onChange, onDragStart, onResizeStart }) {
  const textRef = useRef(null)

  // Keep DOM text in sync when NOT editing (React never renders children
  // for the contentEditable div, so the caret is never disturbed).
  useEffect(() => {
    if (textRef.current && !el.editing) textRef.current.textContent = el.text ?? ''
  }, [el.text, el.editing])

  useEffect(() => {
    if (el.editing && textRef.current) {
      textRef.current.focus()
      const range = document.createRange()
      range.selectNodeContents(textRef.current)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }, [el.editing])

  const style = { left: el.x, top: el.y, width: el.width, height: el.height }

  let shape = null
  if (el.type === 'rect') shape = { background: el.fill, borderRadius: el.radius || 0 }
  else if (el.type === 'circle') shape = { background: el.fill, borderRadius: '50%' }
  else if (el.type === 'triangle') shape = { background: el.fill, clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }
  else if (el.type === 'line') shape = { background: el.fill, borderRadius: 3 }

  return (
    <div
      className={`el${selected ? ' selected' : ''}${el.editing ? ' editing' : ''}`}
      style={style}
      onPointerDown={(e) => {
        if (el.editing) return
        e.stopPropagation()
        onSelect(el.id)
        onDragStart(e, el)
      }}
      onDoubleClick={(e) => {
        if (el.type === 'text') {
          e.stopPropagation()
          onChange({ editing: true })
        }
      }}
    >
      {shape && <div style={{ ...shape, width: '100%', height: '100%' }} />}
      {el.type === 'image' && (
        <img
          src={el.src}
          alt=""
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
        />
      )}
      {el.type === 'text' && (
        <div
          ref={textRef}
          contentEditable={el.editing || undefined}
          suppressContentEditableWarning
          onBlur={(e) => onChange({ text: e.currentTarget.innerText, editing: false })}
          style={{
            width: '100%',
            height: '100%',
            color: el.fill,
            fontSize: el.fontSize,
            fontWeight: el.fontWeight,
            fontFamily: el.fontFamily,
            textAlign: el.align || 'center',
            outline: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            pointerEvents: el.editing ? 'auto' : 'none',
          }}
        />
      )}
      {selected && !el.editing && (
        <div
          className="handle"
          onPointerDown={(e) => {
            e.stopPropagation()
            onResizeStart(e, el)
          }}
        />
      )}
    </div>
  )
}
