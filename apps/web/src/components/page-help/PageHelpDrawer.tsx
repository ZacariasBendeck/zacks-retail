import { Drawer } from 'antd'
import { PageHelpContent } from './PageHelpContent'
import type { PageHelpEntry } from './types'

export function PageHelpDrawer({
  entry,
  open,
  onClose,
}: {
  entry: PageHelpEntry | null
  open: boolean
  onClose: () => void
}) {
  return (
    <Drawer
      title={entry ? `Ayuda: ${entry.title}` : 'Ayuda'}
      open={open && Boolean(entry)}
      onClose={onClose}
      width={420}
    >
      {entry ? <PageHelpContent entry={entry} onNavigate={onClose} /> : null}
    </Drawer>
  )
}
