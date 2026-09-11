import { useCallback, useMemo, useRef, useState } from 'react'
import type { ChangeEventHandler } from 'react'
import { CanvasView } from './components/CanvasView'
import { MenuBar } from './components/MenuBar'
import { SidePanel } from './components/SidePanel'
import { StatusBar } from './components/StatusBar'
import { Toolbar } from './components/Toolbar'
import { decodeGB7, encodeGB7 } from './utils/gb7'
import { imageDataToBlob, loadRasterFile, triggerDownload } from './utils/imageIO'
import {
  DEFAULT_INTERPOLATION,
  type InterpolationMethod,
} from './utils/interpolation'
import { computeInitialViewScalePercent } from './utils/viewport'
import { CustomFilterDialog } from './components/CustomFilterDialog'
import { LevelsDialog } from './components/LevelsDialog'
import { ScaleImageDialog } from './components/ScaleImageDialog'
import './App.css'

type SourceFormat = 'png' | 'jpg' | 'gb7'
type SaveFormat = SourceFormat
type ActiveTool = 'select' | 'eyedropper'
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

function rgbToLab(r: number, g: number, b: number) {
  const normalize = (value: number) => {
    const channel = value / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  }

  const lr = normalize(r)
  const lg = normalize(g)
  const lb = normalize(b)

  const x = lr * 0.4124 + lg * 0.3576 + lb * 0.1805
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722
  const z = lr * 0.0193 + lg * 0.1192 + lb * 0.9505

  const refX = 0.95047
  const refY = 1
  const refZ = 1.08883

  const f = (value: number) =>
    value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116

  const fx = f(x / refX)
  const fy = f(y / refY)
  const fz = f(z / refZ)

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

function App() {
  const [imageData, setImageData] = useState<ImageData | null>(null)
  const [sourceFormat, setSourceFormat] = useState<SourceFormat | null>(null)
  const [gb7HasMask, setGb7HasMask] = useState<boolean | null>(null)
  const [saveFormat, setSaveFormat] = useState<SaveFormat>('png')
  const [useMask, setUseMask] = useState(true)
  const [baseName, setBaseName] = useState('image')
  const [userViewScale, setUserViewScale] = useState<number | null>(null)
  const [viewInterpolation, setViewInterpolation] =
    useState<InterpolationMethod>(DEFAULT_INTERPOLATION)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [scaleDialogOpen, setScaleDialogOpen] = useState(false)
  const [activeTool, setActiveTool] = useState<ActiveTool>('select')
  const [channels, setChannels] = useState<ChannelVisibility>({
    gray: true,
    red: true,
    green: true,
    blue: true,
    alpha: true,
  })
  const [eyedropperSample, setEyedropperSample] = useState<EyedropperSample | null>(
    null,
  )
  const [levelsOpen, setLevelsOpen] = useState(false)
  const [levelsPreview, setLevelsPreview] = useState<ImageData | null>(null)
  const [customFilterOpen, setCustomFilterOpen] = useState(false)
  const [filterPreview, setFilterPreview] = useState<ImageData | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const imageWidth = imageData?.width ?? null
  const imageHeight = imageData?.height ?? null

  const acceptTypes = useMemo(() => '.png,.jpg,.jpeg,.gb7', [])

  const handleViewportReady = useCallback((width: number, height: number) => {
    setViewportSize((prev) => {
      if (prev.width === width && prev.height === height) {
        return prev
      }
      return { width, height }
    })
  }, [])

  const imageCharacteristics = useMemo(() => {
    if (!imageData) {
      return { isGrayscale: false, hasAlpha: false }
    }

    const data = imageData.data
    let isGrayscale = true
    let hasAlpha = false
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) {
        isGrayscale = false
      }
      if (data[i + 3] !== 255) {
        hasAlpha = true
      }
      if (!isGrayscale && hasAlpha) {
        break
      }
    }
    return { isGrayscale, hasAlpha }
  }, [imageData])

  const baseImageData = filterPreview ?? levelsPreview ?? imageData

  const processedImageData = useMemo(() => {
    if (!baseImageData) {
      return null
    }

    const output = new ImageData(baseImageData.width, baseImageData.height)
    const src = baseImageData.data
    const dst = output.data
    const isGray = imageCharacteristics.isGrayscale
    const alphaOnly =
      channels.alpha &&
      (isGray
        ? !channels.gray
        : !channels.red && !channels.green && !channels.blue)

    for (let i = 0; i < src.length; i += 4) {
      const r = src[i]
      const g = src[i + 1]
      const b = src[i + 2]
      const a = src[i + 3]

      if (isGray) {
        const gray = channels.gray ? r : 0
        dst[i] = alphaOnly ? a : gray
        dst[i + 1] = alphaOnly ? a : gray
        dst[i + 2] = alphaOnly ? a : gray
      } else {
        dst[i] = alphaOnly ? a : channels.red ? r : 0
        dst[i + 1] = alphaOnly ? a : channels.green ? g : 0
        dst[i + 2] = alphaOnly ? a : channels.blue ? b : 0
      }

      dst[i + 3] = alphaOnly ? 255 : channels.alpha ? a : 255
    }

    return output
  }, [baseImageData, channels, imageCharacteristics.isGrayscale])

  const autoViewScalePercent = useMemo(() => {
    if (!processedImageData || viewportSize.width <= 0 || viewportSize.height <= 0) {
      return 100
    }

    return computeInitialViewScalePercent(
      processedImageData.width,
      processedImageData.height,
      viewportSize.width,
      viewportSize.height,
    )
  }, [processedImageData, viewportSize])

  const viewScalePercent = userViewScale ?? autoViewScalePercent

  const handleFile = async (file: File) => {
    const name = file.name.toLowerCase()
    const nextBaseName = file.name.replace(/\.[^/.]+$/, '') || 'image'

    try {
      if (name.endsWith('.gb7')) {
        const buffer = await file.arrayBuffer()
        const decoded = decodeGB7(buffer)
        setImageData(decoded.imageData)
        setSourceFormat('gb7')
        setGb7HasMask(decoded.hasMask)
        setSaveFormat('gb7')
      } else {
        const loaded = await loadRasterFile(file)
        setImageData(loaded.imageData)
        setSourceFormat(loaded.format)
        setGb7HasMask(null)
        setSaveFormat(loaded.format)
      }

      setBaseName(nextBaseName)
      setUserViewScale(null)
      setViewInterpolation(DEFAULT_INTERPOLATION)
      setEyedropperSample(null)
      setActiveTool('select')
      setChannels({
        gray: true,
        red: true,
        green: true,
        blue: true,
        alpha: true,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось загрузить файл'
      window.alert(message)
    }
  }

  const handleOpenClick = () => {
    fileInputRef.current?.click()
  }

  const handleInputChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.item(0)
    if (file) {
      void handleFile(file)
    }
    event.target.value = ''
  }

  const handleSave = async () => {
    if (!processedImageData) {
      return
    }

    try {
      if (saveFormat === 'gb7') {
        const buffer = encodeGB7(processedImageData, useMask)
        const blob = new Blob([buffer], {
          type: 'application/octet-stream',
        })
        triggerDownload(blob, `${baseName}.gb7`)
        return
      }

      const blob = await imageDataToBlob(processedImageData, saveFormat)
      triggerDownload(blob, `${baseName}.${saveFormat}`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось сохранить файл'
      window.alert(message)
    }
  }

  const toggleChannel = (channel: ChannelId) => {
    setChannels((prev) => ({ ...prev, [channel]: !prev[channel] }))
  }

  const handleEyedropperSample = (x: number, y: number) => {
    if (!baseImageData) {
      return
    }
    const index = (y * baseImageData.width + x) * 4
    const r = baseImageData.data[index]
    const g = baseImageData.data[index + 1]
    const b = baseImageData.data[index + 2]
    const a = baseImageData.data[index + 3]
    setEyedropperSample({
      x,
      y,
      r,
      g,
      b,
      a,
      lab: rgbToLab(r, g, b),
    })
  }

  return (
    <div className="app-shell">
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptTypes}
        hidden
        onChange={handleInputChange}
      />

      <MenuBar
        onOpenClick={handleOpenClick}
        onSaveClick={() => void handleSave()}
        onLevelsClick={() => setLevelsOpen(true)}
        onScaleClick={() => setScaleDialogOpen(true)}
        onCustomFilterClick={() => setCustomFilterOpen(true)}
        canSave={imageData !== null}
        canLevels={imageData !== null}
        canScale={imageData !== null}
        canCustomFilter={imageData !== null}
      />

      {imageData && scaleDialogOpen && (
        <ScaleImageDialog
          imageData={imageData}
          onApply={(result) => {
            setImageData(result)
            setLevelsPreview(null)
            setFilterPreview(null)
            setEyedropperSample(null)
          }}
          onClose={() => setScaleDialogOpen(false)}
        />
      )}

      {imageData && customFilterOpen && (
        <CustomFilterDialog
          imageData={imageData}
          hasAlpha={imageCharacteristics.hasAlpha}
          onPreviewChange={setFilterPreview}
          onApply={(result) => {
            setImageData(result)
            setFilterPreview(null)
            setLevelsPreview(null)
            setEyedropperSample(null)
          }}
          onClose={() => {
            setCustomFilterOpen(false)
            setFilterPreview(null)
          }}
        />
      )}

      {imageData && levelsOpen && (
        <LevelsDialog
          imageData={imageData}
          hasAlpha={imageCharacteristics.hasAlpha}
          onPreviewChange={setLevelsPreview}
          onApply={(result) => {
            setImageData(result)
            setLevelsPreview(null)
          }}
          onClose={() => {
            setLevelsOpen(false)
            setLevelsPreview(null)
          }}
        />
      )}

      <Toolbar
        hasImage={imageData !== null}
        saveFormat={saveFormat}
        useMask={useMask}
        onOpenClick={handleOpenClick}
        onSaveClick={() => void handleSave()}
        onSaveFormatChange={setSaveFormat}
        onUseMaskChange={setUseMask}
      />

      <div className="left-rail">
        <button
          type="button"
          className={`rail-btn ${activeTool === 'select' ? 'active' : ''}`}
          title="Выделение"
          onClick={() => setActiveTool('select')}
        >
          <svg viewBox="0 0 24 24">
            <path d="M4 4l8 18 2-8 8-2z" />
          </svg>
        </button>
        <button
          type="button"
          className={`rail-btn ${activeTool === 'eyedropper' ? 'active' : ''}`}
          title="Пипетка"
          onClick={() => setActiveTool('eyedropper')}
        >
          <svg viewBox="0 0 24 24">
            <path d="M14 4l6 6-2 2-2-2-7.5 7.5a2.5 2.5 0 11-3.5-3.5L12.5 6l-2-2z" />
          </svg>
        </button>
      </div>

      <CanvasView
        imageData={processedImageData}
        pickImageData={baseImageData}
        scalePercent={viewScalePercent}
        interpolationMethod={viewInterpolation}
        onFileDrop={(file) => void handleFile(file)}
        onViewportReady={handleViewportReady}
        onCanvasPick={activeTool === 'eyedropper' ? handleEyedropperSample : undefined}
      />

      <SidePanel
        imageData={imageData}
        channels={channels}
        isGrayscale={imageCharacteristics.isGrayscale}
        hasAlpha={imageCharacteristics.hasAlpha}
        viewScalePercent={viewScalePercent}
        interpolationMethod={viewInterpolation}
        onScaleChange={setUserViewScale}
        onInterpolationChange={setViewInterpolation}
        onChannelToggle={toggleChannel}
        eyedropperSample={eyedropperSample}
      />

      <StatusBar
        width={imageWidth}
        height={imageHeight}
        sourceFormat={sourceFormat}
        hasAlpha={imageCharacteristics.hasAlpha}
        gb7HasMask={gb7HasMask}
        viewScalePercent={viewScalePercent}
      />
    </div>
  )
}

export default App
