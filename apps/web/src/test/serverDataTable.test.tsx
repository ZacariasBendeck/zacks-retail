import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import ServerDataTable, { normalizeServerFilters } from '../components/ServerDataTable'

interface DemoRow {
  id: string
  name: string
  units: number
  department: string
}

const rows: DemoRow[] = Array.from({ length: 120 }, (_, index) => ({
  id: `row-${index + 1}`,
  name: `Style ${index + 1}`,
  units: index + 10,
  department: index % 2 === 0 ? 'FORMAL' : 'CASUAL',
}))

describe('ServerDataTable', () => {
  it('emits server query changes on sort and pagination', async () => {
    const user = userEvent.setup()
    const onQueryChange = vi.fn()

    render(
      <ConfigProvider>
        <ServerDataTable<DemoRow>
          title="Demo"
          data={rows.slice(0, 25)}
          rowKey="id"
          columns={[
            { title: 'Name', dataIndex: 'name', key: 'name', sorter: true },
            { title: 'Units', dataIndex: 'units', key: 'units' },
            {
              title: 'Department',
              dataIndex: 'department',
              key: 'department',
              filters: [
                { text: 'FORMAL', value: 'FORMAL' },
                { text: 'CASUAL', value: 'CASUAL' },
              ],
            },
          ]}
          pagination={{ page: 1, pageSize: 25, totalItems: 120, totalPages: 5 }}
          onQueryChange={onQueryChange}
          expectedTotalRows={120}
        />
      </ConfigProvider>,
    )

    const nameHeaders = screen.getAllByRole('columnheader', { name: /Name/i })
    expect(nameHeaders.length).toBeGreaterThan(0)
    const firstNameHeader = nameHeaders[0]
    await user.click(firstNameHeader!)
    await waitFor(() => {
      expect(onQueryChange).toHaveBeenCalled()
    })

    const nextButton = screen.getByTitle('Next Page')
    await user.click(nextButton)
    await waitFor(() => {
      expect(onQueryChange).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }))
    })
  })

  it('enables virtualization when expected row count is high', () => {
    render(
      <ConfigProvider>
        <ServerDataTable<DemoRow>
          title="Virtualized"
          data={rows}
          rowKey="id"
          columns={[
            { title: 'Name', dataIndex: 'name', key: 'name' },
            { title: 'Units', dataIndex: 'units', key: 'units' },
          ]}
          pagination={{ page: 1, pageSize: 120, totalItems: 2400, totalPages: 20 }}
          expectedTotalRows={2400}
        />
      </ConfigProvider>,
    )

    expect(document.querySelector('.ant-table-virtual')).toBeInTheDocument()
  })

  it('does not enable virtualization below threshold', () => {
    render(
      <ConfigProvider>
        <ServerDataTable<DemoRow>
          title="Standard"
          data={rows.slice(0, 25)}
          rowKey="id"
          columns={[
            { title: 'Name', dataIndex: 'name', key: 'name' },
            { title: 'Units', dataIndex: 'units', key: 'units' },
          ]}
          pagination={{ page: 1, pageSize: 25, totalItems: 500, totalPages: 20 }}
          expectedTotalRows={500}
        />
      </ConfigProvider>,
    )

    expect(document.querySelector('.ant-table-virtual')).not.toBeInTheDocument()
  })

  it('supports column visibility toggles and CSV/Excel exports', async () => {
    const user = userEvent.setup()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const createObjectUrlSpy = vi.fn(() => 'blob:table-export')
    const revokeObjectUrlSpy = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectUrlSpy,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectUrlSpy,
    })

    render(
      <ConfigProvider>
        <ServerDataTable<DemoRow>
          title="Export Demo"
          data={rows.slice(0, 25)}
          rowKey="id"
          columns={[
            { title: 'Name', dataIndex: 'name', key: 'name' },
            { title: 'Units', dataIndex: 'units', key: 'units' },
          ]}
          pagination={{ page: 1, pageSize: 25, totalItems: 120, totalPages: 5 }}
          exportFileName="export-demo"
        />
      </ConfigProvider>,
    )

    await user.click(screen.getByRole('button', { name: /Columns/i }))
    await user.click(screen.getByRole('checkbox', { name: 'Units' }))

    await waitFor(() => {
      expect(screen.queryByRole('columnheader', { name: 'Units' })).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /CSV/i }))
    await user.click(screen.getByRole('button', { name: /Excel/i }))

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(2)
    expect(clickSpy).toHaveBeenCalledTimes(2)
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(2)

    clickSpy.mockRestore()
  })

  it('normalizes filter payloads for server-side query propagation', () => {
    expect(
      normalizeServerFilters({
        department: ['FORMAL', 'CASUAL'],
        status: null,
        empty: [],
      }),
    ).toEqual({
      department: ['FORMAL', 'CASUAL'],
    })
  })
})
