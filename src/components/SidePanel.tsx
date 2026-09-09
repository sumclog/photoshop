import { useCallback, useEffect, useRef, useState } from 'react'
import {
  INTERPOLATION_METHODS,
  type InterpolationMethod,
} from '../utils/interpolation'
import { VIEW_SCALE_MAX, VIEW_SCALE_MIN } from '../utils/viewport'

type ChannelId = 'gray' | 'red' | 'green' | 'blue' | 'alpha'

type ChannelVisibility = {
  gray: boolean
  red: boolean
  green: boolean
  blue: boolean
  alpha: boolean
}

type EyedropperSample = {
  x: number
  y: number
  r: number
  g: number
  b: number
  a: number
  lab: { l: number; a: number; b: number }
}

type SidePanelProps = {
  imageData: ImageData | null
  channels: ChannelVisibility
  isGrayscale: boolean
  hasAlpha: boolean
  viewScalePercent: number
  interpolationMethod: InterpolationMethod
  onScaleChange: (percent: number) => void
  onInterpolationChange: (method: InterpolationMethod) => void
  onChannelToggle: (channel: ChannelId) => void
  eyedropperSample: EyedropperSample | null
}

export function SidePanel({
  imageData,
  channels,
  isGrayscale,
  hasAlpha,
  viewScalePercent,
  interpolationMethod,
  onScaleChange,
  onInterpolationChange,
  onChannelToggle,
  eyedropperSample,
}: SidePanelProps) {
  const previewRef = useRef<HTMLCanvasElement | null>(null)
  const [localScale, setLocalScale] = useState(() => Math.round(viewScalePercent))
  const scaleRafRef = useRef<number | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalScale(Math.round(viewScalePercent))
  }, [viewScalePercent])

  const handleScaleChange = useCallback(
    (value: number) => {
      setLocalScale(value)
      if (scaleRafRef.current !== null) {
        cancelAnimationFrame(scaleRafRef.current)
      }
      scaleRafRef.current = requestAnimationFrame(() => {
        scaleRafRef.current = null
        onScaleChange(value)
      })
    },
    [onScaleChange],
  )

  useEffect(
    () => () => {
      if (scaleRafRef.current !== null) {
        cancelAnimationFrame(scaleRafRef.current)
      }
    },
    [],
  )
  const channelPreviewRefs = useRef<Record<ChannelId, HTMLCanvasElement | null>>({
    gray: null,
    red: null,
    green: null,
    blue: null,
    alpha: null,
  })

  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas || !imageData) {
      return
    }

    const maxSide = 140
    const ratio = Math.min(
      maxSide / imageData.width,
      maxSide / imageData.height,
      1,
    )
    const width = Math.max(1, Math.round(imageData.width * ratio))
    const height = Math.max(1, Math.round(imageData.height * ratio))

    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    const temp = document.createElement('canvas')
    temp.width = imageData.width
    temp.height = imageData.height
    temp.getContext('2d')?.putImageData(imageData, 0, 0)
    ctx.drawImage(temp, 0, 0, width, height)
  }, [imageData])

  useEffect(() => {
    if (!imageData) {
      return
    }

    const drawChannelPreview = (channel: ChannelId) => {
      const canvas = channelPreviewRefs.current[channel]
      if (!canvas) {
        return
      }

      const width = 88
      const ratio = imageData.height / imageData.width
      const height = Math.max(1, Math.round(width * ratio))
      canvas.width = width
      canvas.height = height

      const offscreen = document.createElement('canvas')
      offscreen.width = imageData.width
      offscreen.height = imageData.height
      const offCtx = offscreen.getContext('2d')
      if (!offCtx) {
        return
      }

      const source = imageData.data
      const output = new ImageData(imageData.width, imageData.height)
      const data = output.data

      for (let i = 0; i < source.length; i += 4) {
        const r = source[i]
        const g = source[i + 1]
        const b = source[i + 2]
        const a = source[i + 3]
        const gray = r

        if (channel === 'gray') {
          data[i] = gray
          data[i + 1] = gray
          data[i + 2] = gray
          data[i + 3] = 255
        } else if (channel === 'red') {
          data[i] = r
          data[i + 1] = r
          data[i + 2] = r
          data[i + 3] = 255
        } else if (channel === 'green') {
          data[i] = g
          data[i + 1] = g
          data[i + 2] = g
          data[i + 3] = 255
        } else if (channel === 'blue') {
          data[i] = b
          data[i + 1] = b
          data[i + 2] = b
          data[i + 3] = 255
        } else {
          data[i] = a
          data[i + 1] = a
          data[i + 2] = a
          data[i + 3] = 255
        }
      }

      offCtx.putImageData(output, 0, 0)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return
      }
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(offscreen, 0, 0, width, height)
    }

    const visibleChannels: ChannelId[] = isGrayscale
      ? hasAlpha
        ? ['gray', 'alpha']
        : ['gray']
      : hasAlpha
        ? ['red', 'green', 'blue', 'alpha']
        : ['red', 'green', 'blue']
    visibleChannels.forEach(drawChannelPreview)
  }, [hasAlpha, imageData, isGrayscale])

  const zoomPercent = localScale
  const channelRows: Array<{ id: ChannelId; label: string }> = isGrayscale
    ? hasAlpha
      ? [
          { id: 'gray', label: 'Gray' },
          { id: 'alpha', label: 'Alpha' },
        ]
      : [{ id: 'gray', label: 'Gray' }]
    : hasAlpha
      ? [
          { id: 'red', label: 'R' },
          { id: 'green', label: 'G' },
          { id: 'blue', label: 'B' },
          { id: 'alpha', label: 'A' },
        ]
      : [
          { id: 'red', label: 'R' },
          { id: 'green', label: 'G' },
          { id: 'blue', label: 'B' },
        ]

  return (
    <aside className="side-panel">
      <section className="panel-block">
        <header className="panel-header">Навигация</header>
        <div className="panel-body">
          {imageData ? (
            <>
              <canvas ref={previewRef} className="nav-preview" />
              <div className="nav-meta">
                <span>W: {imageData.width}</span>
                <span>H: {imageData.height}</span>
              </div>
              <label className="zoom-control" htmlFor="zoom-range">
                Масштаб: {zoomPercent}%
              </label>
              <input
                id="zoom-range"
                type="range"
                min={VIEW_SCALE_MIN}
                max={VIEW_SCALE_MAX}
                value={zoomPercent}
                onChange={(event) => handleScaleChange(Number(event.target.value))}
              />
              <label className="zoom-control" htmlFor="interpolation-method">
                Интерполяция
              </label>
              <select
                id="interpolation-method"
                value={interpolationMethod}
                onChange={(event) =>
                  onInterpolationChange(
                    event.target.value as InterpolationMethod,
                  )
                }
              >
                {(Object.keys(INTERPOLATION_METHODS) as InterpolationMethod[]).map(
                  (key) => (
                    <option key={key} value={key}>
                      {INTERPOLATION_METHODS[key].label}
                    </option>
                  ),
                )}
              </select>
              <p
                className="interpolation-hint"
                title={INTERPOLATION_METHODS[interpolationMethod].description}
              >
                {INTERPOLATION_METHODS[interpolationMethod].description}
              </p>
            </>
          ) : (
            <p className="panel-empty">Нет изображения</p>
          )}
        </div>
      </section>

      <section className="panel-block">
        <header className="panel-header">Каналы</header>
        <div className="panel-body">
          {imageData ? (
            <div className="channels-list">
              {channelRows.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  className={`channel-item ${channels[channel.id] ? 'active' : ''}`}
                  onClick={() => onChannelToggle(channel.id)}
                >
                  <canvas
                    ref={(node) => {
                      channelPreviewRefs.current[channel.id] = node
                    }}
                    className="channel-thumb"
                  />
                  <span>{channel.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="panel-empty">Нет изображения</p>
          )}
        </div>
      </section>

      <section className="panel-block">
        <header className="panel-header">Пипетка</header>
        <div className="panel-body">
          {eyedropperSample ? (
            <div className="eyedropper-data">
              <div
                className="eyedropper-swatch"
                title={`rgb(${eyedropperSample.r}, ${eyedropperSample.g}, ${eyedropperSample.b})`}
                aria-label={`Цвет: ${eyedropperSample.r}, ${eyedropperSample.g}, ${eyedropperSample.b}`}
              >
                <div
                  className="eyedropper-swatch-color"
                  style={{
                    backgroundColor: `rgba(${eyedropperSample.r}, ${eyedropperSample.g}, ${eyedropperSample.b}, ${eyedropperSample.a / 255})`,
                  }}
                />
              </div>
              <span>
                X: {eyedropperSample.x}, Y: {eyedropperSample.y}
              </span>
              <span>
                RGB: {eyedropperSample.r}, {eyedropperSample.g},{' '}
                {eyedropperSample.b}
              </span>
              {hasAlpha && (
                <span>Alpha: {eyedropperSample.a}</span>
              )}
              <span>
                LAB: {eyedropperSample.lab.l.toFixed(2)},{' '}
                {eyedropperSample.lab.a.toFixed(2)},{' '}
                {eyedropperSample.lab.b.toFixed(2)}
              </span>
            </div>
          ) : (
            <p className="panel-empty">Выберите пипетку и кликните по холсту</p>
          )}
        </div>
      </section>
    </aside>
  )
}
