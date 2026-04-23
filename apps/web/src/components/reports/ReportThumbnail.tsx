import { Image } from 'antd'

interface Props {
  /** Absolute or `/rics-images/…` URL. When null/empty, renders nothing. */
  url: string | null | undefined
  /** Optional alt text for accessibility. */
  alt?: string
}

/**
 * Canonical product thumbnail for every report surface. Matches the size used
 * on the Products → SKUs list page (`apps/web/src/pages/products/skus/SkuListPage.tsx`)
 * so operators get the same visual across reports and the SKU list.
 *
 * Contract:
 *   - `height: 50`, `width: auto` → portrait stays narrow, landscape widens
 *     naturally, capped at `maxWidth: 120` so the column doesn't blow out.
 *   - Ant `<Image>` with `preview={{ mask: false }}` gives click-to-zoom for
 *     free (lightbox with pan / rotate / fullscreen), no extra UI.
 *   - Broken image requests hide themselves (visibility=hidden) rather than
 *     showing the default broken-image icon, so a missing picture doesn't
 *     punch a hole in the row.
 *
 * Callers should size the containing column to roughly 135px wide to match
 * `maxWidth + padding`.
 */
export default function ReportThumbnail({ url, alt = '' }: Props): JSX.Element | null {
  if (!url) return null
  return (
    <Image
      src={url}
      alt={alt}
      loading="lazy"
      style={{
        height: 50,
        width: 'auto',
        maxWidth: 120,
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
