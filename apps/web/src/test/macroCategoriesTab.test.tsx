import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttributeDimension } from '../types/productsAttributes'

vi.mock('../hooks/useProductsAttributes', () => ({
  useAttributeMacroRules: vi.fn(),
  useAttributeMacroRuleSet: vi.fn(),
  useReplaceAttributeMacroRules: vi.fn(),
}))

import * as hooks from '../hooks/useProductsAttributes'
import MacroCategoriesTab from '../pages/products/attributes/MacroCategoriesTab'

function dimension(
  code: string,
  labelEs: string,
  values: AttributeDimension['values'] = [],
): AttributeDimension {
  return {
    id: code.length,
    code,
    labelEs,
    descriptionEs: null,
    sortOrder: 0,
    isMultiValue: false,
    familyRules: [],
    values,
  }
}

function renderMacroTab() {
  return render(
    <ConfigProvider>
      <AntApp>
        <MacroCategoriesTab
          dimensions={[
            dimension('color', 'Color'),
            dimension('color_family', 'Color Family', [
              {
                id: 1,
                code: 'warm',
                labelEs: 'Calido',
                descriptionEs: null,
                sortOrder: 1,
                isActive: true,
              },
              {
                id: 2,
                code: 'cool',
                labelEs: 'Frio',
                descriptionEs: null,
                sortOrder: 2,
                isActive: true,
              },
              {
                id: 3,
                code: 'dark',
                labelEs: 'Oscuro',
                descriptionEs: null,
                sortOrder: 3,
                isActive: true,
              },
            ]),
          ]}
        />
      </AntApp>
    </ConfigProvider>,
  )
}

function ruleTable(container: HTMLElement): HTMLElement {
  const tables = container.querySelectorAll('.ant-table')
  const table = tables[tables.length - 1]
  if (!table) throw new Error('Expected macro rule table to render')
  return table as HTMLElement
}

function ruleSourceLabels(container: HTMLElement): string[] {
  const rows = ruleTable(container).querySelectorAll('.ant-table-tbody tr')
  return Array.from(rows).map((row) => row.querySelector('td')?.textContent?.trim() ?? '')
}

describe('MacroCategoriesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hooks.useAttributeMacroRules).mockReturnValue({
      data: [
        {
          sourceDimensionCode: 'color',
          sourceDimensionLabelEs: 'Color',
          targetDimensionCode: 'color_family',
          targetDimensionLabelEs: 'Color Family',
          mappedCount: 3,
          sourceValueCount: 3,
          updatedAt: '2026-05-06T12:00:00.000Z',
        },
      ],
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(hooks.useAttributeMacroRuleSet).mockReturnValue({
      data: {
        sourceDimensionCode: 'color',
        sourceDimensionLabelEs: 'Color',
        targetDimensionCode: 'color_family',
        targetDimensionLabelEs: 'Color Family',
        rules: [
          {
            sourceValueCode: 'NEGRO',
            sourceLabelEs: 'Negro',
            targetValueCode: 'dark',
            targetLabelEs: 'Oscuro',
            updatedAt: '2026-05-06T12:00:00.000Z',
            updatedBy: 'system',
          },
          {
            sourceValueCode: 'ROJO',
            sourceLabelEs: 'Rojo',
            targetValueCode: 'warm',
            targetLabelEs: 'Calido',
            updatedAt: '2026-05-06T12:01:00.000Z',
            updatedBy: 'system',
          },
          {
            sourceValueCode: 'AZUL',
            sourceLabelEs: 'Azul',
            targetValueCode: 'cool',
            targetLabelEs: 'Frio',
            updatedAt: '2026-05-06T12:02:00.000Z',
            updatedBy: 'system',
          },
        ],
      },
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(hooks.useReplaceAttributeMacroRules).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
  })

  it('sorts macro rules from column headers', async () => {
    const user = userEvent.setup()
    const { container } = renderMacroTab()

    await screen.findByText('Azul')
    expect(ruleSourceLabels(container)).toEqual(['NegroNEGRO', 'RojoROJO', 'AzulAZUL'])

    await user.click(within(ruleTable(container)).getByText('Color'))
    await waitFor(() => {
      expect(ruleSourceLabels(container)).toEqual(['AzulAZUL', 'NegroNEGRO', 'RojoROJO'])
    })

    await user.click(within(ruleTable(container)).getByText('Color Family'))
    await waitFor(() => {
      expect(ruleSourceLabels(container)).toEqual(['RojoROJO', 'AzulAZUL', 'NegroNEGRO'])
    })
  })
})
