import { useCallback, useEffect, useRef, useState } from 'react'
import { cloneImageData } from '../utils/levels'
import {
  applyKernelConvolution,
  DEFAULT_KERNEL,
  findMatchingPresetId,
  KERNEL_PRESETS,
  type EdgePadding,
  type FilterChannelMask,
  type KernelPresetId,
} from '../utils/convolution'
import { Modal } from './Modal'
import './CustomFilterDialog.css'

type CustomFilterDialogProps = {
  imageData: ImageData
  hasAlpha: boolean
  onPreviewChange: (preview: ImageData | null) => void
  onApply: (result: ImageData) => void
  onClose: () => void
}

const DEFAULT_CHANNELS: FilterChannelMask = {
  red: true,
  green: true,
  blue: true,
  alpha: false,
}

const DEFAULT_PADDING: EdgePadding = 'replicate'

function formatKernelValue(value: number): string {
  if (Number.isInteger(value)) {
    return String(value)
  }
  const rounded = Number(value.toFixed(4))
  return String(rounded)
}

function parseKernelInput(raw: string): number {
  const parsed = Number.parseFloat(raw.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export function CustomFilterDialog({
  imageData,
  hasAlpha,
  onPreviewChange,
  onApply,
  onClose,
}: CustomFilterDialogProps) {
  const snapshotRef = useRef<ImageData>(cloneImageData(imageData))
  const previewAbortRef = useRef<AbortController | null>(null)
  const applyAbortRef = useRef<AbortController | null>(null)
  const previewDebounceRef = useRef<number | null>(null)

  const [presetId, setPresetId] = useState<KernelPresetId>('identity')
  const [kernel, setKernel] = useState<number[]>([...DEFAULT_KERNEL])
  const [padding, setPadding] = useState<EdgePadding>(DEFAULT_PADDING)
  const [channels, setChannels] = useState<FilterChannelMask>(DEFAULT_CHANNELS)
  const [previewEnabled, setPreviewEnabled] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cancelPreview = useCallback(() => {
    previewAbortRef.current?.abort()
    previewAbortRef.current = null
  }, [])

  const runPreview = useCallback(
    async (
      nextKernel: readonly number[],
      nextPadding: EdgePadding,
      nextChannels: FilterChannelMask,
    ) => {
      if (!snapshotRef.current || !previewEnabled) {
        return
      }

      cancelPreview()
      const controller = new AbortController()
      previewAbortRef.current = controller

      try {
        const result = await applyKernelConvolution(
          snapshotRef.current,
          nextKernel,
          nextPadding,
          nextChannels,
          { signal: controller.signal },
        )
        if (!controller.signal.aborted) {
          onPreviewChange(result)
        }
      } catch (previewError) {
        if (
          previewError instanceof DOMException &&
          previewError.name === 'AbortError'
        ) {
          return
        }
        const message =
          previewError instanceof Error
            ? previewError.message
            : 'Не удалось построить предпросмотр'
        setError(message)
      }
    },
    [cancelPreview, onPreviewChange, previewEnabled],
  )

  useEffect(() => {
    if (!previewEnabled) {
      if (previewDebounceRef.current !== null) {
        window.clearTimeout(previewDebounceRef.current)
        previewDebounceRef.current = null
      }
      cancelPreview()
      onPreviewChange(null)
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null)

    // Дебаунс 300мс
    if (previewDebounceRef.current !== null) {
      window.clearTimeout(previewDebounceRef.current)
    }
    previewDebounceRef.current = window.setTimeout(() => {
      previewDebounceRef.current = null
      void runPreview(kernel, padding, channels)
    }, 300)

    return () => {
      if (previewDebounceRef.current !== null) {
        window.clearTimeout(previewDebounceRef.current)
        previewDebounceRef.current = null
      }
    }
  }, [kernel, padding, channels, previewEnabled, runPreview, cancelPreview, onPreviewChange])

  useEffect(
    () => () => {
      if (previewDebounceRef.current !== null) {
        window.clearTimeout(previewDebounceRef.current)
      }
      cancelPreview()
      applyAbortRef.current?.abort()
      onPreviewChange(null)
    },
    [cancelPreview, onPreviewChange],
  )

  const handlePresetChange = (nextPresetId: KernelPresetId) => {
    setPresetId(nextPresetId)
    const preset = KERNEL_PRESETS.find((item) => item.id === nextPresetId)
    if (preset) {
      setKernel([...preset.values])
    }
    setError(null)
  }

  const handleKernelCellChange = (index: number, raw: string) => {
    const next = [...kernel]
    next[index] = parseKernelInput(raw)
    setKernel(next)
    setPresetId(findMatchingPresetId(next))
    setError(null)
  }

  const toggleChannel = (channel: keyof FilterChannelMask) => {
    setChannels((prev) => ({ ...prev, [channel]: !prev[channel] }))
    setError(null)
  }

  const handleReset = () => {
    handlePresetChange('identity')
    setPadding(DEFAULT_PADDING)
    setChannels({ ...DEFAULT_CHANNELS })
    setError(null)
  }

  const handleClose = () => {
    cancelPreview()
    applyAbortRef.current?.abort()
    onPreviewChange(null)
    onClose()
  }

  const handleApply = async () => {
    if (!snapshotRef.current) {
      return
    }

    const hasSelectedChannel =
      channels.red || channels.green || channels.blue || channels.alpha
    if (!hasSelectedChannel) {
      setError('Выберите хотя бы один канал.')
      return
    }

    cancelPreview()
    applyAbortRef.current?.abort()
    const controller = new AbortController()
    applyAbortRef.current = controller

    setProcessing(true)
    setProgress(0)
    setError(null)

    try {
      const result = await applyKernelConvolution(
        snapshotRef.current,
        kernel,
        padding,
        channels,
        {
          signal: controller.signal,
          onProgress: (value) => setProgress(value),
        },
      )

      if (!controller.signal.aborted) {
        onPreviewChange(null)
        onApply(result)
        onClose()
      }
    } catch (applyError) {
      if (
        applyError instanceof DOMException &&
        applyError.name === 'AbortError'
      ) {
        return
      }
      const message =
        applyError instanceof Error
          ? applyError.message
          : 'Не удалось применить фильтр'
      setError(message)
    } finally {
      if (!controller.signal.aborted) {
        setProcessing(false)
        setProgress(null)
      }
    }
  }

  const footer = (
    <div className="custom-filter-footer">
      <label className="custom-filter-preview-row custom-filter-footer-left">
        <input
          type="checkbox"
          checked={previewEnabled}
          disabled={processing}
          onChange={(event) => setPreviewEnabled(event.target.checked)}
        />
        Предпросмотр
      </label>
      <button
        type="button"
        className="app-modal-btn"
        disabled={processing}
        onClick={handleReset}
      >
        Сбросить
      </button>
      <button
        type="button"
        className="app-modal-btn"
        disabled={processing}
        onClick={handleClose}
      >
        Закрыть
      </button>
      <button
        type="button"
        className="app-modal-btn app-modal-btn-primary"
        disabled={processing}
        onClick={() => void handleApply()}
      >
        Применить
      </button>
    </div>
  )

  return (
    <Modal open title="Произвольный фильтр" onClose={handleClose} footer={footer}>
      <div className="custom-filter-form">
        <div className="custom-filter-row">
          <label htmlFor="filter-preset">Преднастройка</label>
          <select
            id="filter-preset"
            value={presetId}
            disabled={processing}
            onChange={(event) =>
              handlePresetChange(event.target.value as KernelPresetId)
            }
          >
            {KERNEL_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div className="custom-filter-row">
          <p className="custom-filter-section-title">Ядро 3×3</p>
          <div className="custom-filter-kernel-grid">
            {kernel.map((value, index) => (
              <input
                key={index}
                type="number"
                step="any"
                disabled={processing}
                value={formatKernelValue(value)}
                onChange={(event) =>
                  handleKernelCellChange(index, event.target.value)
                }
                aria-label={`Ячейка ${index + 1}`}
              />
            ))}
          </div>
        </div>

        <div className="custom-filter-row">
          <p className="custom-filter-section-title">Каналы</p>
          <div className="custom-filter-checks">
            <label>
              <input
                type="checkbox"
                checked={channels.red}
                disabled={processing}
                onChange={() => toggleChannel('red')}
              />
              R
            </label>
            <label>
              <input
                type="checkbox"
                checked={channels.green}
                disabled={processing}
                onChange={() => toggleChannel('green')}
              />
              G
            </label>
            <label>
              <input
                type="checkbox"
                checked={channels.blue}
                disabled={processing}
                onChange={() => toggleChannel('blue')}
              />
              B
            </label>
            {hasAlpha && (
              <label>
                <input
                  type="checkbox"
                  checked={channels.alpha}
                  disabled={processing}
                  onChange={() => toggleChannel('alpha')}
                />
                A
              </label>
            )}
          </div>
        </div>

        <div className="custom-filter-padding">
          <p className="custom-filter-section-title">Обработка краёв</p>
          <div className="custom-filter-padding-options">
            <label>
              <input
                type="radio"
                name="edge-padding"
                checked={padding === 'black'}
                disabled={processing}
                onChange={() => setPadding('black')}
              />
              Чёрный
            </label>
            <label>
              <input
                type="radio"
                name="edge-padding"
                checked={padding === 'white'}
                disabled={processing}
                onChange={() => setPadding('white')}
              />
              Белый
            </label>
            <label>
              <input
                type="radio"
                name="edge-padding"
                checked={padding === 'replicate'}
                disabled={processing}
                onChange={() => setPadding('replicate')}
              />
              Копирование
            </label>
          </div>
        </div>

        {processing && progress !== null && (
          <p className="custom-filter-progress">
            Обработка… {Math.round(progress * 100)}%
          </p>
        )}
        {error && <p className="custom-filter-error">{error}</p>}
      </div>
    </Modal>
  )
}
