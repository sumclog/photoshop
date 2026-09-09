import { useEffect, useRef } from 'react'
import type { DragEventHandler, MouseEvent } from 'react'
import type { InterpolationMethod } from '../utils/interpolation'

type CanvasViewProps = {
  imageData: ImageData | null
  pickImageData: ImageData | null
  scalePercent: number
  interpolationMethod: InterpolationMethod
  onFileDrop: (file: File) => void
  onViewportReady: (width: number, height: number) => void
  onCanvasPick?: (x: number, y: number) => void
}

export function CanvasView({
  imageData,
  pickImageData,
  scalePercent,
  interpolationMethod,
  onFileDrop,
  onViewportReady,
  onCanvasPick,
}: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    if (!imageData) {
      canvas.width = 1
      canvas.height = 1
      ctx.clearRect(0, 0, 1, 1)
      return
    }

    // GPU-масштабирование через drawImage вместо JS resizeImageData
    const targetWidth = Math.max(
      1,
      Math.round((imageData.width * scalePercent) / 100),
    )
    const targetHeight = Math.max(
      1,
      Math.round((imageData.height * scalePercent) / 100),
    )

    canvas.width = targetWidth
    canvas.height = targetHeight

    // offscreen canvas с исходными пикселями
    const offscreen = document.createElement('canvas')
    offscreen.width = imageData.width
    offscreen.height = imageData.height
    const offCtx = offscreen.getContext('2d')
    if (!offCtx) {
      return
    }
    offCtx.putImageData(imageData, 0, 0)

    ctx.imageSmoothingEnabled = interpolationMethod === 'bilinear'
    ;(ctx as unknown as { imageSmoothingQuality: string }).imageSmoothingQuality =
      interpolationMethod === 'bilinear' ? 'high' : 'low'
    ctx.clearRect(0, 0, targetWidth, targetHeight)
    ctx.drawImage(offscreen, 0, 0, targetWidth, targetHeight)
  }, [imageData, scalePercent, interpolationMethod])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    const notify = () => {
      onViewportReady(viewport.clientWidth, viewport.clientHeight)
    }

    notify()

    const observer = new ResizeObserver(notify)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [onViewportReady])

  const handleDrop: DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault()
    const file = event.dataTransfer.files.item(0)
    if (file) {
      onFileDrop(file)
    }
  }

  const handleDragOver: DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault()
  }

  const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!imageData || !pickImageData || !onCanvasPick) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top

    // rect.width - отображаемый размер canvas
    const x = Math.max(
      0,
      Math.min(
        pickImageData.width - 1,
        Math.floor((localX / rect.width) * pickImageData.width),
      ),
    )
    const y = Math.max(
      0,
      Math.min(
        pickImageData.height - 1,
        Math.floor((localY / rect.height) * pickImageData.height),
      ),
    )
    onCanvasPick(x, y)
  }

  return (
    <main
      className="canvas-shell"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div ref={viewportRef} className="canvas-scroll">
        {imageData ? (
          <div className="canvas-frame">
            <canvas
              ref={canvasRef}
              className="image-canvas"
              onClick={handleCanvasClick}
            />
          </div>
        ) : (
          <div className="canvas-placeholder">
            Перетащите изображение сюда или нажмите «Открыть»
          </div>
        )}
      </div>
    </main>
  )
}
