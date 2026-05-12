import { Image } from 'antd'

interface Props {
  /** Absolute or app-served image URL. When null/empty, renders nothing. */
  url: string | null | undefined
  /** Optional alt text for accessibility. */
  alt?: string
  /**
   * Inline-thumbnail height in px. Defaults to a compact 36 — sized to keep
   * report rows short while still being recognizable. Clicking the thumbnail
   * opens Ant's lightbox at full resolution, so small isn't a problem. Pass
   * a larger value (e.g. 50) when the surface has room for taller rows.
   */
  height?: number
  /**
   * Maximum width in px before the aspect-true thumbnail clips. Defaults to
   * roughly 3× the height so landscape shots widen naturally without blowing
   * out a column.
   */
  maxWidth?: number
}

/**
 * Canonical product thumbnail for every report surface. Uses Ant `<Image>`
 * so every caller gets click-to-zoom (lightbox with pan / rotate /
 * fullscreen) for free. Broken requests hide themselves rather than leaving
 * a broken-image icon behind.
 *
 * `width: auto` keeps aspect ratio — portrait stays narrow, landscape widens
 * up to `maxWidth`. Callers should size the containing column to
 * `maxWidth + padding` for a clean fit.
 */
export default function ReportThumbnail({
  url,
  alt = '',
  height = 36,
  maxWidth,
}: Props): JSX.Element | null {
  if (!url) return null
  const cap = maxWidth ?? Math.round(height * 2.4)
  return (
    <Image
      src={url}
      alt={alt}
      loading="lazy"
      style={{
        height,
        width: 'auto',
        maxWidth: cap,
        objectFit: 'contain',
        display: 'block',
        cursor: 'zoom-in',
      }}
      preview={{ mask: false }}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
      }}
    />
  )
}
