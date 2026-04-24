import type { CSSProperties } from 'react'

export const tokens = {
  page: { maxWidth: 1400, padding: 24, gap: 24 },
  card: {
    background: '#ffffff',
    border: '1px solid #e8e8e8',
    borderRadius: 14,
    padding: 20,
    headerMarginBottom: 16,
  },
  title: { page: 28, section: 17, fieldLabel: 12, input: 14 },
  colors: {
    border: '#e8e8e8',
    mutedBg: '#fafafa',
    aiFilledBorder: '#52c41a',
    required: '#ff4d4f',
    textMuted: 'rgba(0,0,0,0.45)',
    sectionSubtitle: 'rgba(0,0,0,0.55)',
  },
  image: { dropzoneSize: 240, borderRadius: 12 },
  rowGutter: 16,
  fieldMarginBottom: 12,
} as const

export const pageContainer: CSSProperties = {
  maxWidth: tokens.page.maxWidth,
  margin: '0 auto',
  padding: tokens.page.padding,
  display: 'flex',
  flexDirection: 'column',
  gap: tokens.page.gap,
  width: '100%',
}

export const sectionCard: CSSProperties = {
  background: tokens.card.background,
  border: tokens.card.border,
  borderRadius: tokens.card.borderRadius,
  padding: tokens.card.padding,
  boxShadow: 'none',
}

export const sectionTitle: CSSProperties = {
  fontSize: tokens.title.section,
  fontWeight: 600,
  margin: 0,
  marginBottom: 4,
}

export const sectionSubtitle: CSSProperties = {
  fontSize: 12,
  color: tokens.colors.sectionSubtitle,
  marginBottom: tokens.card.headerMarginBottom,
}

export const sectionHeaderRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: tokens.card.headerMarginBottom,
}

export const AI_FILLED_STYLE: CSSProperties = {
  borderLeft: '3px solid #52c41a',
  paddingLeft: 8,
  borderRadius: 4,
  transition: 'border-color 0.3s',
}

export const readonlyInput: CSSProperties = {
  background: tokens.colors.mutedBg,
}

export const monoInput: CSSProperties = {
  background: tokens.colors.mutedBg,
  fontFamily: 'monospace',
}
