export interface PageHelpLink {
  label: string
  to: string
}

export interface PageHelpTabNote {
  key: string
  label: string
  processSteps?: string[]
  philosophy?: string
  manualLinks?: PageHelpLink[]
}

export interface PageHelpEntry {
  id: string
  title: string
  module: string
  processSteps: string[]
  philosophy: string
  manualLinks: PageHelpLink[]
  tabNotes?: PageHelpTabNote[]
}
