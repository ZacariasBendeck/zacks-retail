export interface ManualChapter {
  slug: string
  title: string
  content: string
}

const modules = import.meta.glob('../../../../docs/zacks-retail-manual/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function chapterSlug(path: string): string {
  const fileName = path.split('/').pop() ?? ''
  const rawSlug = fileName.replace(/\.md$/i, '')
  return rawSlug.toLowerCase()
}

function chapterTitle(content: string, slug: string): string {
  const heading = content.split(/\r?\n/).find((line) => line.startsWith('# '))
  if (heading) return heading.replace(/^#\s+/, '').trim()
  return slug
    .split('-')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}

export const manualChapters: ManualChapter[] = Object.entries(modules)
  .map(([path, content]) => {
    const slug = chapterSlug(path)
    return {
      slug,
      title: chapterTitle(content, slug),
      content,
    }
  })
  .sort((left, right) => {
    if (left.slug === 'index') return -1
    if (right.slug === 'index') return 1
    return left.title.localeCompare(right.title)
  })

export function getManualChapter(slug: string | undefined): ManualChapter | undefined {
  const normalizedSlug = (slug ?? 'index').toLowerCase()
  return manualChapters.find((chapter) => chapter.slug === normalizedSlug)
}
