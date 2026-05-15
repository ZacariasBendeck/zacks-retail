import '@testing-library/jest-dom/vitest'
import { beforeAll, vi } from 'vitest'
import { initGlobalI18nForTests } from '@benlow-rics/i18n/react'

beforeAll(async () => {
  await initGlobalI18nForTests('web')
})

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

const nativeGetComputedStyle = window.getComputedStyle.bind(window)
Object.defineProperty(window, 'getComputedStyle', {
  writable: true,
  value: (element: Element) => nativeGetComputedStyle(element),
})
