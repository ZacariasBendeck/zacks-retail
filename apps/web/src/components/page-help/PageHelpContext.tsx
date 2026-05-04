import { createContext, useContext, useEffect, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { PageHelpEntry } from './types'

interface PageHelpContextValue {
  currentHelp: PageHelpEntry | null
  setCurrentHelp: Dispatch<SetStateAction<PageHelpEntry | null>>
}

const PageHelpContext = createContext<PageHelpContextValue | null>(null)

export function PageHelpProvider({
  children,
  currentHelp,
  setCurrentHelp,
}: PageHelpContextValue & { children: ReactNode }) {
  return (
    <PageHelpContext.Provider value={{ currentHelp, setCurrentHelp }}>
      {children}
    </PageHelpContext.Provider>
  )
}

export function usePageHelp() {
  const context = useContext(PageHelpContext)
  if (!context) {
    throw new Error('usePageHelp must be used within PageHelpProvider')
  }
  return context
}

export function useRegisterPageHelp(entry: PageHelpEntry | null) {
  const context = useContext(PageHelpContext)
  const setCurrentHelp = context?.setCurrentHelp

  useEffect(() => {
    if (!setCurrentHelp) return undefined
    setCurrentHelp(entry)
    return () => {
      setCurrentHelp((current) => (current?.id === entry?.id ? null : current))
    }
  }, [entry, setCurrentHelp])
}
