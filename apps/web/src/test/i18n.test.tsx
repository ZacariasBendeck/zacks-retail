import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  LANGUAGE_STORAGE_KEY,
  normalizeLocale,
  resolvePreferredLocale,
} from '@benlow-rics/i18n'
import {
  AppI18nProvider,
  LanguageSelector,
  useI18nLocale,
} from '@benlow-rics/i18n/react'

function LocaleProbe() {
  const { locale, setLocale } = useI18nLocale()
  return (
    <>
      <span data-testid="locale">{locale}</span>
      <button type="button" onClick={() => void setLocale('es-HN')}>switch</button>
      <LanguageSelector />
    </>
  )
}

describe('frontend i18n foundation', () => {
  it('normalizes supported locale variants', () => {
    expect(normalizeLocale('en')).toBe('en-US')
    expect(normalizeLocale('EN_us')).toBe('en-US')
    expect(normalizeLocale('es')).toBe('es-HN')
    expect(normalizeLocale('es-MX')).toBe('es-HN')
    expect(normalizeLocale('fr-CA')).toBeNull()
  })

  it('resolves locale preference in user, storage, browser, fallback order', () => {
    expect(resolvePreferredLocale({
      userPreference: 'es-HN',
      storedPreference: 'en-US',
      navigatorLanguages: ['en-US'],
    })).toBe('es-HN')
    expect(resolvePreferredLocale({
      storedPreference: 'es-HN',
      navigatorLanguages: ['en-US'],
    })).toBe('es-HN')
    expect(resolvePreferredLocale({ navigatorLanguages: ['es-US'] })).toBe('es-HN')
    expect(resolvePreferredLocale({ navigatorLanguages: ['fr-CA'] })).toBe('en-US')
  })

  it('updates provider locale, html lang, and localStorage when language changes', async () => {
    localStorage.removeItem(LANGUAGE_STORAGE_KEY)
    const user = userEvent.setup()

    render(
      <AppI18nProvider app="web" initialLocale="en-US">
        <LocaleProbe />
      </AppI18nProvider>,
    )

    expect(await screen.findByTestId('locale')).toHaveTextContent('en-US')
    expect(document.documentElement.lang).toBe('en-US')

    await user.click(screen.getByRole('button', { name: 'switch' }))

    await waitFor(() => expect(screen.getByTestId('locale')).toHaveTextContent('es-HN'))
    expect(document.documentElement.lang).toBe('es-HN')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('es-HN')
  })

  it('renders a language selector inside the provider', async () => {
    render(
      <AppI18nProvider app="web" initialLocale="en-US">
        <LanguageSelector />
      </AppI18nProvider>,
    )

    expect(await screen.findByRole('combobox', { name: 'Language' })).toBeInTheDocument()
  })
})
