import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  applyLevels,
  clampChannelLevels,
  cloneImageData,
  computeHistogram,
  DEFAULT_CHANNEL_LEVELS,
  DEFAULT_LEVELS_SETTINGS,
  gammaToSliderPosition,
  sliderPositionToGamma,
  type ChannelLevels,
  type HistogramMode,
  type LevelsChannel,
  type LevelsSettings,
} from '../utils/levels'
import './LevelsDialog.css'

type LevelsDialogProps = {
  imageData: ImageData
  hasAlpha: boolean
  onPreviewChange: (preview: ImageData | null) => void
  onApply: (result: ImageData) => void
  onClose: () => void
}

type DragTarget = 'black' | 'gamma' | 'white' | null

const CHANNELS: { id: LevelsChannel; label: string; color?: string }[] = [
  { id: 'master', label: 'RGB' },
  { id: 'red', label: 'R', color: '#e85c5c' },
  { id: 'green', label: 'G', color: '#5ce87a' },
  { id: 'blue', label: 'B', color: '#5c8ae8' },
  { id: 'alpha', label: 'A', color: '#c8c8c8' },
]

const HIST_WIDTH = 256
const HIST_HEIGHT = 100

function drawHistogram(
  canvas: HTMLCanvasElement,
  histogram: ReturnType<typeof computeHistogram>,
  mode: HistogramMode,
  channel: LevelsChannel,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)

  const maxCount =
    mode === 'log'
      ? Math.max(1, ...Array.from(histogram.bins).map((c) => (c > 0 ? Math.log10(c + 1) : 0)))
      : histogram.maxCount

  const scaleY = (count: number) => {
    const value = mode === 'log' ? (count > 0 ? Math.log10(count + 1) : 0) : count
    return height - (value / maxCount) * (height - 2) - 1
  }

  if (channel === 'master' && histogram.rgbBins) {
    const drawChannel = (bins: Uint32Array, color: string, alpha: number) => {
      ctx.fillStyle = color
      ctx.globalAlpha = alpha
      for (let i = 0; i < 256; i++) {
        const barHeight = height - scaleY(bins[i])
        ctx.fillRect(i, scaleY(bins[i]), 1, barHeight)
      }
    }
    drawChannel(histogram.rgbBins.r, '#c44', 0.45)
    drawChannel(histogram.rgbBins.g, '#4a4', 0.45)
    drawChannel(histogram.rgbBins.b, '#48c', 0.45)
    ctx.globalAlpha = 1
  }

  ctx.fillStyle = channel === 'red' ? '#e85c5c' : channel === 'green' ? '#5ce87a' : channel === 'blue' ? '#5c8ae8' : channel === 'alpha' ? '#b0b0b0' : '#d8d8d8'
  for (let i = 0; i < 256; i++) {
    const y = scaleY(histogram.bins[i])
    ctx.fillRect(i, y, 1, height - y)
  }
}

function LevelsSlider({
  levels,
  onChange,
}: {
  levels: ChannelLevels
  onChange: (levels: ChannelLevels) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragTarget, setDragTarget] = useState<DragTarget>(null)

  const gammaPos = gammaToSliderPosition(
    levels.gamma,
    levels.inBlack,
    levels.inWhite,
  )

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track) return 0
      const rect = track.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return Math.round(ratio * 255)
    },
    [],
  )

  const handlePointerDown = (target: DragTarget) => (event: ReactPointerEvent) => {
    event.preventDefault()
    setDragTarget(target)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (!dragTarget) return

      const value = valueFromClientX(event.clientX)
      const next = { ...levels }

      if (dragTarget === 'black') {
        next.inBlack = Math.min(value, levels.inWhite - 1)
      } else if (dragTarget === 'white') {
        next.inWhite = Math.max(value, levels.inBlack + 1)
      } else if (dragTarget === 'gamma') {
        const clamped = Math.max(levels.inBlack + 1, Math.min(levels.inWhite - 1, value))
        next.gamma = sliderPositionToGamma(clamped, levels.inBlack, levels.inWhite)
      }

      onChange(clampChannelLevels(next))
    },
    [dragTarget, levels, onChange, valueFromClientX],
  )

  const handlePointerUp = useCallback((event: ReactPointerEvent) => {
    setDragTarget(null)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  const blackPct = (levels.inBlack / 255) * 100
  const whitePct = (levels.inWhite / 255) * 100
  const gammaPct = (gammaPos / 255) * 100

  return (
    <div
      className="levels-slider-track"
      ref={trackRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className="levels-slider-gradient"
        style={{
          left: `${blackPct}%`,
          right: `${100 - whitePct}%`,
        }}
      />
      <button
        type="button"
        className="levels-handle levels-handle-black"
        style={{ left: `${blackPct}%` }}
        onPointerDown={handlePointerDown('black')}
        aria-label="Точка чёрного"
      />
      <button
        type="button"
        className="levels-handle levels-handle-gamma"
        style={{ left: `${gammaPct}%` }}
        onPointerDown={handlePointerDown('gamma')}
        aria-label="Полутона"
      />
      <button
        type="button"
        className="levels-handle levels-handle-white"
        style={{ left: `${whitePct}%` }}
        onPointerDown={handlePointerDown('white')}
        aria-label="Точка белого"
      />
    </div>
  )
}

export function LevelsDialog({
  imageData,
  hasAlpha,
  onPreviewChange,
  onApply,
  onClose,
}: LevelsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const histCanvasRef = useRef<HTMLCanvasElement>(null)
  const snapshotRef = useRef<ImageData>(cloneImageData(imageData))

  const [settings, setSettings] = useState<LevelsSettings>(DEFAULT_LEVELS_SETTINGS)
  const [activeChannel, setActiveChannel] = useState<LevelsChannel>('master')
  const [histMode, setHistMode] = useState<HistogramMode>('linear')
  const [previewEnabled, setPreviewEnabled] = useState(true)
  const previewRafRef = useRef<number | null>(null)
  const previewTimeoutRef = useRef<number | null>(null)

  const visibleChannels = CHANNELS.filter(
    (ch) => ch.id !== 'alpha' || hasAlpha,
  )

  const currentLevels = settings[activeChannel]

  const [histogramSource] = useState(() => cloneImageData(imageData))

  const histogram = useMemo(
    () => computeHistogram(histogramSource, activeChannel),
    [histogramSource, activeChannel],
  )

  const updateSettings = useCallback(
    (channel: LevelsChannel, levels: ChannelLevels) => {
      setSettings((prev) => ({
        ...prev,
        [channel]: clampChannelLevels(levels),
      }))
    },
    [],
  )

  const schedulePreview = useCallback(
    (nextSettings: LevelsSettings) => {
      if (!snapshotRef.current || !previewEnabled) return

      // Дебаунс + RAF: при драге ползунка не блокируем UI синхронным applyLevels
      if (previewTimeoutRef.current !== null) {
        window.clearTimeout(previewTimeoutRef.current)
      }
      if (previewRafRef.current !== null) {
        cancelAnimationFrame(previewRafRef.current)
        previewRafRef.current = null
      }

      previewTimeoutRef.current = window.setTimeout(() => {
        previewTimeoutRef.current = null
        previewRafRef.current = requestAnimationFrame(() => {
          previewRafRef.current = null
          if (snapshotRef.current) {
            onPreviewChange(applyLevels(snapshotRef.current, nextSettings))
          }
        })
      }, 30)
    },
    [onPreviewChange, previewEnabled],
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
    }
  }, [])

  useEffect(() => {
    if (!previewEnabled) {
      if (previewTimeoutRef.current !== null) {
        window.clearTimeout(previewTimeoutRef.current)
        previewTimeoutRef.current = null
      }
      if (previewRafRef.current !== null) {
        cancelAnimationFrame(previewRafRef.current)
        previewRafRef.current = null
      }
      onPreviewChange(null)
      return
    }
    schedulePreview(settings)
  }, [previewEnabled, settings, schedulePreview, onPreviewChange])

  useEffect(
    () => () => {
      if (previewTimeoutRef.current !== null) {
        window.clearTimeout(previewTimeoutRef.current)
      }
      if (previewRafRef.current !== null) {
        cancelAnimationFrame(previewRafRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    const canvas = histCanvasRef.current
    if (!canvas) return
    drawHistogram(canvas, histogram, histMode, activeChannel)
  }, [histogram, histMode, activeChannel])

  const handleLevelsChange = (levels: ChannelLevels) => {
    updateSettings(activeChannel, levels)
  }

  const handleReset = () => {
    setSettings((prev) => ({
      ...prev,
      [activeChannel]: { ...DEFAULT_CHANNEL_LEVELS },
    }))
  }

  const handleCancel = () => {
    onPreviewChange(null)
    onClose()
  }

  const handleApply = () => {
    if (snapshotRef.current) {
      onApply(applyLevels(snapshotRef.current, settings))
    }
    onPreviewChange(null)
    onClose()
  }

  const handleDialogClose = () => {
    onPreviewChange(null)
    onClose()
  }

  const handleGammaInput = (value: string) => {
    const parsed = Number.parseFloat(value)
    if (!Number.isFinite(parsed)) return
    handleLevelsChange(
      clampChannelLevels({
        ...currentLevels,
        gamma: parsed,
      }),
    )
  }

  return (
    <dialog
      ref={dialogRef}
      className="levels-dialog"
      onClose={handleDialogClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          handleCancel()
        }
      }}
    >
      <div className="levels-dialog-inner">
        <header className="levels-header">
          <h2>Уровни</h2>
          <button
            type="button"
            className="levels-close-btn"
            aria-label="Закрыть"
            onClick={handleCancel}
          >
            ×
          </button>
        </header>

        <div className="levels-body">
          <div className="levels-channels">
            {visibleChannels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                className={`levels-channel-btn ${activeChannel === ch.id ? 'active' : ''}`}
                data-channel={ch.id}
                title={ch.label}
                onClick={() => setActiveChannel(ch.id)}
              >
                <span className="levels-channel-dot" />
              </button>
            ))}
          </div>

          <div className="levels-main">
            <div className="levels-histogram-wrap">
              <canvas
                ref={histCanvasRef}
                className="levels-histogram"
                width={HIST_WIDTH}
                height={HIST_HEIGHT}
              />
            </div>

            <LevelsSlider levels={currentLevels} onChange={handleLevelsChange} />

            <div className="levels-values">
              <label className="levels-value-field">
                <span className="sr-only">Чёрная точка</span>
                <input
                  type="number"
                  min={0}
                  max={254}
                  value={currentLevels.inBlack}
                  onChange={(event) =>
                    handleLevelsChange(
                      clampChannelLevels({
                        ...currentLevels,
                        inBlack: Number(event.target.value),
                      }),
                    )
                  }
                />
              </label>
              <label className="levels-value-field levels-gamma-field">
                <span className="sr-only">Гамма</span>
                <input
                  type="number"
                  min={0.1}
                  max={9.9}
                  step={0.01}
                  value={Number(currentLevels.gamma.toFixed(2))}
                  onChange={(event) => handleGammaInput(event.target.value)}
                />
              </label>
              <label className="levels-value-field">
                <span className="sr-only">Белая точка</span>
                <input
                  type="number"
                  min={1}
                  max={255}
                  value={currentLevels.inWhite}
                  onChange={(event) =>
                    handleLevelsChange(
                      clampChannelLevels({
                        ...currentLevels,
                        inWhite: Number(event.target.value),
                      }),
                    )
                  }
                />
              </label>
            </div>

            <div className="levels-hist-mode">
              <span>Гистограмма:</span>
              <label>
                <input
                  type="radio"
                  name="hist-mode"
                  checked={histMode === 'linear'}
                  onChange={() => setHistMode('linear')}
                />
                Линейная
              </label>
              <label>
                <input
                  type="radio"
                  name="hist-mode"
                  checked={histMode === 'log'}
                  onChange={() => setHistMode('log')}
                />
                Логарифмическая
              </label>
            </div>
          </div>
        </div>

        <footer className="levels-footer">
          <label className="levels-preview-check">
            <input
              type="checkbox"
              checked={previewEnabled}
              onChange={(event) => setPreviewEnabled(event.target.checked)}
            />
            Просмотр
          </label>

          <div className="levels-footer-actions">
            <button type="button" className="levels-btn levels-btn-ghost" onClick={handleReset}>
              Сброс
            </button>
            <button type="button" className="levels-btn levels-btn-outline" onClick={handleCancel}>
              Отмена
            </button>
            <button type="button" className="levels-btn levels-btn-primary" onClick={handleApply}>
              Применить
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  )
}
