type SourceFormat = 'png' | 'jpg' | 'gb7' | null

type StatusBarProps = {
  width: number | null
  height: number | null
  sourceFormat: SourceFormat
  hasAlpha: boolean
  gb7HasMask?: boolean | null
  viewScalePercent: number
}

function getColorDepth(
  format: SourceFormat,
  hasAlpha: boolean,
  gb7HasMask?: boolean | null,
): string {
  if (format === 'gb7') {
    return gb7HasMask ? '8-бит (7 gray + 1 маска)' : '7-бит grayscale'
  }

  if (format === 'jpg') {
    return '24-бит RGB'
  }

  if (format === 'png') {
    return hasAlpha ? '32-бит RGBA' : '24-бит RGB'
  }

  return 'изображение не загружено'
}

export function StatusBar({
  width,
  height,
  sourceFormat,
  hasAlpha,
  gb7HasMask,
  viewScalePercent,
}: StatusBarProps) {
  const hasSize = width !== null && height !== null
  const zoomPercent = Math.round(viewScalePercent)
  const size = hasSize
    ? `${width} × ${height} px @ ${zoomPercent}%`
    : '-- × -- px'

  return (
    <footer className="status-bar">
      <span className="status-info">
        {size} | {getColorDepth(sourceFormat, hasAlpha, gb7HasMask)}
      </span>
    </footer>
  )
}
