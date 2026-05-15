import { useEffect, useMemo, useState } from 'react'
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  InputNumber,
  Input,
  List,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  DollarOutlined,
  KeyOutlined,
  LockOutlined,
  PrinterOutlined,
  ReloadOutlined,
  ShoppingOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useTranslation } from '@benlow-rics/i18n/react'
import { fetchSalesPasswordStatus, setSalesPassword } from '../services/posApi'
import {
  useAddLine,
  useAddTender,
  useCashTotals,
  useCloseShift,
  useCreatePayout,
  useCreateTicket,
  useEndTicket,
  useOpenShift,
  useOpenShifts,
  usePayoutCategories,
  usePostShiftToInventory,
  useRegisters,
  useRemoveLine,
  useReprintTicket,
  useStores,
  useTenderTypes,
  useTicket,
  useVoidTicket,
} from '../hooks/usePos'
import { searchPosSkus, type PosSku } from '../services/skuApi'
import type { SalesTicket, Shift, TenderKind } from '../types/pos'

const DEFAULT_CASHIER = 'cashier-1'
const DEFAULT_STORE_ID = 1

export default function CheckoutPage() {
  const { message } = App.useApp()
  const { t } = useTranslation('pos')

  const [storeId] = useState(DEFAULT_STORE_ID)
  const [registerId, setRegisterId] = useState<string>('')
  const [ticketId, setTicketId] = useState<string | null>(null)
  // Batch-mode shift awaiting Post Sales to Inventory. Set after a successful
  // close when posting_mode was BATCH; cleared after successful post.
  const [pendingPostShift, setPendingPostShift] = useState<Shift | null>(null)

  const stores = useStores()
  const registers = useRegisters(storeId)
  const openShifts = useOpenShifts(storeId)

  // Pre-select the seeded register A, or first available.
  useEffect(() => {
    if (!registerId && registers.data?.registers.length) {
      const first = registers.data.registers[0]
      if (first) setRegisterId(first.id)
    }
  }, [registers.data, registerId])

  const activeShift = useMemo<Shift | null>(() => {
    if (!registerId || !openShifts.data) return null
    return openShifts.data.shifts.find((s) => s.registerId === registerId) ?? null
  }, [openShifts.data, registerId])

  const ticket = useTicket(ticketId)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Row align="middle" gutter={16}>
          <Col flex="auto">
            <Space direction="vertical" size={2}>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {t('checkout.title')}
              </Typography.Title>
              <Typography.Text type="secondary">
                {stores.data?.stores[0]?.name ?? t('checkout.storeFallback')} - {t('checkout.cashier', { cashier: DEFAULT_CASHIER })}
              </Typography.Text>
            </Space>
          </Col>
          <Col>
            <Space size="middle">
              <Select
                style={{ minWidth: 180 }}
                placeholder={t('checkout.registerPlaceholder')}
                value={registerId || undefined}
                options={
                  registers.data?.registers.map((r) => ({
                    label: `${r.label} (${r.code})`,
                    value: r.id,
                  })) ?? []
                }
                onChange={(value) => {
                  setTicketId(null)
                  setRegisterId(value)
                }}
              />
              <ShiftStatusTag shift={activeShift} />
              <OnlineStatusBadge />
              <Button
                icon={<KeyOutlined />}
                onClick={() => setPasswordModalOpen(true)}
                title="Change sales passwords (RICS p. 52)"
              >
                {t('checkout.passwords')}
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <SalesPasswordModal
        storeId={storeId}
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
      />

      {pendingPostShift && (
        <PendingPostBanner
          shift={pendingPostShift}
          onPosted={() => {
            setPendingPostShift(null)
            message.success(t('checkout.salesPosted'))
          }}
          onDismiss={() => setPendingPostShift(null)}
        />
      )}

      {!registerId ? (
        <Card>
          <Empty description={t('checkout.pickRegister')} />
        </Card>
      ) : !activeShift ? (
        <OpenShiftCard
          storeId={storeId}
          registerId={registerId}
          onOpened={() => openShifts.refetch()}
        />
      ) : (
        <ShiftOpenView
          shift={activeShift}
          storeId={storeId}
          ticketId={ticketId}
          ticket={ticket.data ?? null}
          onCreateTicket={(t) => setTicketId(t.id)}
          onClearTicket={() => setTicketId(null)}
          onShiftClosed={(closed) => {
            setTicketId(null)
            openShifts.refetch()
            if (closed.postingMode === 'BATCH' && !closed.postedAt) {
              setPendingPostShift(closed)
            }
          }}
          onTicketRefresh={() => ticket.refetch()}
          messageApi={message}
        />
      )}
    </Space>
  )
}

function PendingPostBanner({
  shift,
  onPosted,
  onDismiss,
}: {
  shift: Shift
  onPosted: () => void
  onDismiss: () => void
}) {
  const { message } = App.useApp()
  const { t } = useTranslation('pos')
  const postShift = usePostShiftToInventory()
  return (
    <Card
      style={{ borderColor: '#faad14' }}
      styles={{ header: { background: '#fffbe6' } }}
      title={
        <Space>
          <Typography.Text strong>{t('checkout.shiftClosedUnposted')}</Typography.Text>
          <Tag color="warning">{t('checkout.batchMode')}</Tag>
        </Space>
      }
      extra={
        <Space>
          <Button
            type="primary"
            onClick={async () => {
              try {
                await postShift.mutateAsync({ shiftId: shift.id, postedByUserId: DEFAULT_CASHIER })
                onPosted()
              } catch (e: any) {
                message.error(e?.message ?? 'Post to inventory failed')
              }
            }}
            loading={postShift.isPending}
          >
            {t('checkout.postSales')}
          </Button>
          <Button onClick={onDismiss}>{t('checkout.later')}</Button>
        </Space>
      }
    >
      <Typography.Paragraph style={{ marginBottom: 0 }}>
        Shift opened {formatDate(shift.openedAt)} · last ticket #{shift.lastTicketNumberUsed}. In
        batch mode, ticket lines are held as PENDING_POST until you click Post Sales to Inventory —
        inventory on-hand does not change until you post. See RICS manual p. 45.
      </Typography.Paragraph>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function ShiftStatusTag({ shift }: { shift: Shift | null }) {
  const { t } = useTranslation('pos')
  if (!shift) return <Tag color="default">{t('checkout.noOpenShift')}</Tag>
  return (
    <Tag color="processing">
      {t('checkout.shiftOpen', { ticketNumber: shift.lastTicketNumberUsed })}
    </Tag>
  )
}

function OnlineStatusBadge() {
  const { t } = useTranslation('common')
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  useEffect(() => {
    const onUp = () => setOnline(true)
    const onDown = () => setOnline(false)
    window.addEventListener('online', onUp)
    window.addEventListener('offline', onDown)
    return () => {
      window.removeEventListener('online', onUp)
      window.removeEventListener('offline', onDown)
    }
  }, [])
  return (
    <Tag color={online ? 'success' : 'error'}>
      {online ? t('status.online') : t('status.offline')}
    </Tag>
  )
}

// ---------------------------------------------------------------------------

function OpenShiftCard({
  storeId,
  registerId,
  onOpened,
}: {
  storeId: number
  registerId: string
  onOpened: () => void
}) {
  const { message } = App.useApp()
  const { t } = useTranslation('pos')
  const [form] = Form.useForm()
  const openMutation = useOpenShift()

  return (
    <Card title={t('checkout.openShift')}>
      <Form
        layout="vertical"
        form={form}
        initialValues={{
          openedByUserId: DEFAULT_CASHIER,
          openingCashFloat: 100,
          postingMode: 'REALTIME',
        }}
        onFinish={async (values) => {
          try {
            await openMutation.mutateAsync({
              storeId,
              registerId,
              openedByUserId: values.openedByUserId,
              openingCashFloat: Number(values.openingCashFloat) || 0,
              postingMode: values.postingMode,
            })
            message.success(t('checkout.shiftOpened'))
            onOpened()
          } catch (e: any) {
            message.error(e?.message ?? t('messages.failedOpenShift'))
          }
        }}
      >
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="openedByUserId"
              label={t('checkout.cashierId')}
              rules={[{ required: true, message: t('checkout.cashierRequired') }]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="openingCashFloat"
              label={t('checkout.openingCashFloat')}
              rules={[{ required: true, message: t('checkout.cashFloatRequired') }]}
            >
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="postingMode"
              label={t('checkout.postingMode')}
              tooltip={t('checkout.postingModeTooltip')}
            >
              <Select
                options={[
                  { value: 'REALTIME', label: t('checkout.realTime') },
                  { value: 'BATCH', label: t('checkout.batch') },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>
        <Button type="primary" htmlType="submit" loading={openMutation.isPending}>
          {t('checkout.openShift')}
        </Button>
      </Form>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function ShiftOpenView({
  shift,
  storeId,
  ticket,
  onCreateTicket,
  onClearTicket,
  onShiftClosed,
  onTicketRefresh,
  messageApi,
}: {
  shift: Shift
  storeId: number
  ticketId: string | null
  ticket: SalesTicket | null
  onCreateTicket: (t: SalesTicket) => void
  onClearTicket: () => void
  onShiftClosed: (closed: Shift) => void
  onTicketRefresh: () => void
  messageApi: ReturnType<typeof App.useApp>['message']
}) {
  const { t } = useTranslation('pos')
  const createTicket = useCreateTicket()
  const [payoutOpen, setPayoutOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [totalsOpen, setTotalsOpen] = useState(false)
  void messageApi // surfaced via sub-components via their own App.useApp()

  async function handleStartTicket() {
    try {
      const t = await createTicket.mutateAsync({
        shiftId: shift.id,
        cashierUserId: DEFAULT_CASHIER,
      })
      onCreateTicket(t)
    } catch (e: any) {
      messageApi.error(e?.message ?? t('messages.failedStartTicket'))
    }
  }

  return (
    <>
      <Row gutter={16}>
        <Col xs={24} md={16}>
          {ticket ? (
            <TicketPanel
              ticket={ticket}
              storeId={storeId}
              onClear={onClearTicket}
              onRefresh={onTicketRefresh}
            />
          ) : (
            <Card title={t('checkout.noActiveTicket')}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Typography.Paragraph>
                  {t('checkout.startTicketHint')}
                </Typography.Paragraph>
                <Button
                  type="primary"
                  size="large"
                  icon={<ShoppingOutlined />}
                  onClick={handleStartTicket}
                  loading={createTicket.isPending}
                >
                  {t('checkout.newTicket')}
                </Button>
              </Space>
            </Card>
          )}
        </Col>

        <Col xs={24} md={8}>
          <Card title={t('checkout.shift')}>
            <Descriptions size="small" column={1} colon={false}>
              <Descriptions.Item label={t('checkout.openedBy')}>{shift.openedByUserId}</Descriptions.Item>
              <Descriptions.Item label={t('checkout.float')}>${shift.openingCashFloat.toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label={t('checkout.postingMode')}>{shift.postingMode}</Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 12 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button block icon={<DollarOutlined />} onClick={() => setTotalsOpen(true)}>
                  {t('checkout.cashTotals')}
                </Button>
                <Button block icon={<ReloadOutlined />} onClick={() => setPayoutOpen(true)}>
                  {t('checkout.payOut')}
                </Button>
                <Button
                  block
                  danger
                  icon={<LockOutlined />}
                  onClick={() => setCloseOpen(true)}
                  disabled={!!ticket && !ticket.endedAt}
                >
                  {t('checkout.closeShift')}
                </Button>
              </Space>
            </div>
          </Card>
        </Col>
      </Row>

      <PayoutModal
        shiftId={shift.id}
        storeId={storeId}
        open={payoutOpen}
        onClose={() => setPayoutOpen(false)}
      />
      <CloseShiftModal
        shiftId={shift.id}
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onClosed={(closed) => {
          setCloseOpen(false)
          onShiftClosed(closed)
        }}
      />
      <CashTotalsDrawer
        shiftId={shift.id}
        open={totalsOpen}
        onClose={() => setTotalsOpen(false)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------

function TicketPanel({
  ticket,
  storeId,
  onClear,
  onRefresh,
}: {
  ticket: SalesTicket
  storeId: number
  onClear: () => void
  onRefresh: () => void
}) {
  const { message } = App.useApp()
  const { t } = useTranslation('pos')
  const addLine = useAddLine(ticket.id)
  const removeLine = useRemoveLine(ticket.id)
  const endTicket = useEndTicket()
  const reprint = useReprintTicket()
  void storeId // reserved for future per-store settings reads

  const [voidOpen, setVoidOpen] = useState(false)

  const isFrozen = !!ticket.endedAt || !!ticket.voidedAt

  const tenderedSum = ticket.tenders.reduce((acc, t) => acc + (t.isContinuation ? 0 : t.amount), 0)
  const balance = Math.max(0, ticket.grandTotal - tenderedSum)
  const change = Math.max(0, tenderedSum - ticket.grandTotal)

  async function handleAddSku(sku: PosSku, quantity: number) {
    try {
      await addLine.mutateAsync({
        skuCode: sku.skuCode,
        quantity: sku.coupon && quantity > 0 ? -Math.abs(quantity) : quantity,
        unitPrice: sku.currentPrice,
        priceSlotUsed:
          sku.currentPriceSlot === 1 ? 'LIST'
          : sku.currentPriceSlot === 2 ? 'RETAIL'
          : sku.currentPriceSlot === 3 ? 'MARKDOWN1'
          : 'MARKDOWN2',
      })
      onRefresh()
    } catch (e: any) {
      message.error(e?.message ?? t('messages.failedAddLine'))
    }
  }

  async function handleRemoveLine(lineId: string) {
    try {
      await removeLine.mutateAsync(lineId)
    } catch (e: any) {
      message.error(e?.message ?? t('messages.failedRemoveLine'))
    }
  }

  async function handleEnd() {
    if (ticket.lines.length === 0) {
      message.warning(t('messages.addLineBeforeEnd'))
      return
    }
    if (tenderedSum < ticket.grandTotal) {
      message.warning(t('messages.tenderShort', { amount: `$${(ticket.grandTotal - tenderedSum).toFixed(2)}` }))
      return
    }
    try {
      await endTicket.mutateAsync(ticket.id)
      message.success(t('messages.ticketPosted', { ticketNumber: ticket.ticketNumber }))
    } catch (e: any) {
      message.error(e?.message ?? t('messages.failedEndSale'))
    }
  }

  return (
    <Card
      title={
        <Space>
          <span>
            {t('checkout.ticket', { ticketNumber: ticket.ticketNumber })}
            {isFrozen && (
              <Tag style={{ marginLeft: 8 }} color={ticket.voidedAt ? 'red' : 'success'}>
                {ticket.voidedAt ? t('checkout.voided') : ticket.postingStatus}
              </Tag>
            )}
          </span>
        </Space>
      }
      extra={
        <Space>
          {isFrozen && (
            <>
              <Button
                icon={<PrinterOutlined />}
                onClick={async () => {
                  try {
                    await reprint.mutateAsync({
                      ticketId: ticket.id,
                      actorUserId: DEFAULT_CASHIER,
                    })
                    message.success(t('messages.reprintRecorded'))
                  } catch (e: any) {
                    message.error(e?.message ?? t('messages.reprintFailed'))
                  }
                }}
              >
                {t('checkout.reprint')}
              </Button>
              <Button type="primary" icon={<ShoppingOutlined />} onClick={onClear}>
                {t('checkout.newTicket')}
              </Button>
            </>
          )}
          {!isFrozen && (
            <Button
              danger
              icon={<StopOutlined />}
              onClick={() => setVoidOpen(true)}
            >
              {t('checkout.void')}
            </Button>
          )}
        </Space>
      }
    >
      <Row gutter={16}>
        <Col xs={24} lg={14}>
          {!isFrozen && <SkuSearchPanel onAdd={handleAddSku} disabled={addLine.isPending} />}
          <Table
            size="small"
            style={{ marginTop: 12 }}
            rowKey="id"
            dataSource={ticket.lines}
            pagination={false}
            locale={{ emptyText: t('checkout.noItems') }}
            columns={[
              {
                title: '#',
                dataIndex: 'lineNumber',
                width: 50,
              },
              {
                title: 'SKU',
                dataIndex: 'skuCodeSnapshot',
                render: (v) => v ?? '—',
              },
              {
                title: t('checkout.qty'),
                dataIndex: 'quantity',
                width: 60,
                align: 'right',
              },
              {
                title: t('checkout.unit'),
                dataIndex: 'unitPrice',
                width: 90,
                align: 'right',
                render: (v: number) => `$${v.toFixed(2)}`,
              },
              {
                title: t('checkout.net'),
                dataIndex: 'extendedNet',
                width: 100,
                align: 'right',
                render: (v: number) => `$${v.toFixed(2)}`,
              },
              ...(!isFrozen
                ? [
                    {
                      title: '',
                      width: 40,
                      render: (_: unknown, row: any) => (
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => handleRemoveLine(row.id)}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
            summary={() => (
              <>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    <strong>{t('checkout.subtotal')}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <strong>${ticket.subtotal.toFixed(2)}</strong>
                  </Table.Summary.Cell>
                  {!isFrozen && <Table.Summary.Cell index={2} />}
                </Table.Summary.Row>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    {t('checkout.tax')}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    ${ticket.taxTotal.toFixed(2)}
                  </Table.Summary.Cell>
                  {!isFrozen && <Table.Summary.Cell index={2} />}
                </Table.Summary.Row>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    <Typography.Text strong style={{ fontSize: 16 }}>
                      {t('checkout.grandTotal')}
                    </Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <Typography.Text strong style={{ fontSize: 16 }}>
                      ${ticket.grandTotal.toFixed(2)}
                    </Typography.Text>
                  </Table.Summary.Cell>
                  {!isFrozen && <Table.Summary.Cell index={2} />}
                </Table.Summary.Row>
              </>
            )}
          />
        </Col>

        <Col xs={24} lg={10}>
          <Card size="small" title={t('checkout.tenders')} style={{ marginBottom: 12 }}>
            <TendersPanel ticket={ticket} storeId={storeId} disabled={isFrozen} />
            {ticket.tenders.length > 0 && (
              <List
                size="small"
                dataSource={ticket.tenders.filter((t) => !t.isContinuation)}
                renderItem={(t) => (
                  <List.Item>
                    <span>
                      <Tag color="blue">{t.tenderKind}</Tag>
                    </span>
                    <strong>${t.amount.toFixed(2)}</strong>
                  </List.Item>
                )}
              />
            )}
          </Card>

          <Card size="small">
            <Row gutter={8}>
              <Col span={12}>
                <Statistic
                  title={t('checkout.balanceDue')}
                  value={balance}
                  precision={2}
                  prefix="$"
                  valueStyle={{ color: balance > 0 ? '#cf1322' : '#3f8600' }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title={t('checkout.change')}
                  value={isFrozen ? ticket.changeGiven : change}
                  precision={2}
                  prefix="$"
                />
              </Col>
            </Row>
            {!isFrozen && (
              <Button
                type="primary"
                size="large"
                block
                style={{ marginTop: 12 }}
                disabled={ticket.lines.length === 0 || tenderedSum < ticket.grandTotal}
                loading={endTicket.isPending}
                onClick={handleEnd}
              >
                {t('checkout.endSale')}
              </Button>
            )}
            {isFrozen && !ticket.voidedAt && (
              <Typography.Paragraph
                type="secondary"
                style={{ marginTop: 12, marginBottom: 0 }}
              >
                {t('checkout.posted', { date: formatDate(ticket.postedAt) })}
              </Typography.Paragraph>
            )}
          </Card>
        </Col>
      </Row>

      <VoidModal
        ticketId={ticket.id}
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        onVoided={() => setVoidOpen(false)}
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------

function SkuSearchPanel({
  onAdd,
  disabled,
}: {
  onAdd: (sku: PosSku, quantity: number) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('pos')
  const [query, setQuery] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [results, setResults] = useState<PosSku[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (query.trim().length < 2) {
      setResults([])
      setError(null)
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const data = await searchPosSkus(query.trim(), 20)
        if (!cancelled) {
          setResults(data)
          setError(null)
        }
      } catch (err: any) {
        if (!cancelled) {
          setResults([])
          setError(err?.message ?? t('messages.skuSearchFailed'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, t])

  return (
    <Card size="small" title={t('checkout.addItem')}>
      <Space.Compact block>
        <Input
          placeholder={t('checkout.scanPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          autoFocus
        />
        <InputNumber
          value={quantity}
          onChange={(v) => setQuantity(Number(v) || 1)}
          min={-999}
          max={999}
          style={{ width: 90 }}
          disabled={disabled}
        />
      </Space.Compact>
      {error && (
        <Typography.Paragraph type="danger" style={{ marginTop: 8, marginBottom: 0 }}>
          {error}
        </Typography.Paragraph>
      )}
      {results.length > 0 && (
        <List
          size="small"
          style={{ marginTop: 8, maxHeight: 320, overflowY: 'auto' }}
          loading={loading}
          dataSource={results}
          renderItem={(sku) => {
            const slotLabel =
              sku.currentPriceSlot === 1 ? 'List'
              : sku.currentPriceSlot === 2 ? 'Retail'
              : sku.currentPriceSlot === 3 ? 'MD1'
              : 'MD2'
            return (
              <List.Item
                actions={[
                  <Button
                    key="add"
                    type="primary"
                    size="small"
                    disabled={disabled}
                    onClick={() => {
                      onAdd(sku, quantity)
                      setQuery('')
                      setResults([])
                      setQuantity(1)
                    }}
                  >
                    {t('checkout.addItem')}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <span>
                      <Typography.Text code>{sku.skuCode}</Typography.Text>{'  '}
                      {sku.description ?? sku.styleColor ?? t('checkout.noDescription')}
                      {sku.coupon && <Tag color="gold" style={{ marginLeft: 8 }}>{t('checkout.coupon')}</Tag>}
                    </span>
                  }
                  description={
                    <Space size="small" wrap>
                      <Typography.Text strong>${sku.currentPrice.toFixed(2)}</Typography.Text>
                      <Tag>{slotLabel}</Tag>
                      {sku.vendorName && <span>{sku.vendorName}</span>}
                      {sku.categoryName && <span>· {sku.categoryName}</span>}
                      {sku.department && <Tag color="blue">{sku.department}</Tag>}
                    </Space>
                  }
                />
              </List.Item>
            )
          }}
        />
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------

function TendersPanel({
  ticket,
  storeId,
  disabled,
}: {
  ticket: SalesTicket
  storeId: number
  disabled?: boolean
}) {
  const { message } = App.useApp()
  const { t } = useTranslation('pos')
  const tenderTypes = useTenderTypes(storeId)
  const addTender = useAddTender(ticket.id)

  const [tenderTypeId, setTenderTypeId] = useState<string | undefined>(undefined)
  const [amount, setAmount] = useState<number>(0)
  const [accountNumber, setAccountNumber] = useState('')

  // Hide CONTINUATION tender from cashier manual picker.
  const availableTenders =
    tenderTypes.data?.tenderTypes.filter((tt) => tt.tenderKind !== ('CONTINUATION' as TenderKind)) ?? []

  const currentTT = availableTenders.find((tt) => tt.id === tenderTypeId)
  const requiresAccount = currentTT?.requireAccountNumber || currentTT?.tenderKind === 'STORE_CREDIT'

  async function handleAdd() {
    if (!tenderTypeId) {
      message.warning(t('messages.pickTenderType'))
      return
    }
    if (!amount) {
      message.warning(t('messages.enterTenderAmount'))
      return
    }
    if (requiresAccount && !accountNumber) {
      message.warning(t('messages.accountRequired'))
      return
    }
    try {
      await addTender.mutateAsync({
        tenderTypeId,
        amount,
        accountNumber: accountNumber || undefined,
      })
      setAmount(0)
      setAccountNumber('')
    } catch (e: any) {
      message.error(e?.message ?? t('messages.failedAddTender'))
    }
  }

  const balance = Math.max(
    0,
    ticket.grandTotal -
      ticket.tenders.filter((t) => !t.isContinuation).reduce((a, t) => a + t.amount, 0)
  )

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Select
        placeholder={t('checkout.tenderType')}
        style={{ width: '100%' }}
        value={tenderTypeId}
        disabled={disabled}
        options={availableTenders.map((tt) => ({ label: tt.label, value: tt.id }))}
        onChange={(v) => {
          setTenderTypeId(v)
          if (amount === 0) setAmount(Number(balance.toFixed(2)))
        }}
      />
      <InputNumber
        value={amount}
        onChange={(v) => setAmount(Number(v) || 0)}
        placeholder={t('checkout.amount')}
        prefix="$"
        step={0.01}
        style={{ width: '100%' }}
        disabled={disabled}
      />
      {requiresAccount && (
        <Input
          placeholder={t('checkout.customerAccount')}
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          disabled={disabled}
        />
      )}
      <Button
        type="primary"
        block
        onClick={handleAdd}
        disabled={disabled || ticket.tenders.filter((t) => !t.isContinuation).length >= 4}
        loading={addTender.isPending}
      >
        {t('checkout.addTender')}
      </Button>
    </Space>
  )
}

// ---------------------------------------------------------------------------

function VoidModal({
  ticketId,
  open,
  onClose,
  onVoided,
}: {
  ticketId: string
  open: boolean
  onClose: () => void
  onVoided: () => void
}) {
  const { message } = App.useApp()
  const voidTicket = useVoidTicket()
  const [form] = Form.useForm()

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Void ticket"
      okText="Void"
      okButtonProps={{ danger: true, loading: voidTicket.isPending }}
      onOk={async () => {
        const values = await form.validateFields()
        try {
          await voidTicket.mutateAsync({
            ticketId,
            actorUserId: DEFAULT_CASHIER,
            reason: values.reason,
            password: values.password || undefined,
          })
          message.success('Ticket voided')
          form.resetFields()
          onVoided()
        } catch (e: any) {
          message.error(e?.message ?? 'Failed to void')
        }
      }}
    >
      <Form layout="vertical" form={form}>
        <Form.Item name="reason" label="Reason">
          <Input placeholder="Optional" />
        </Form.Item>
        <Form.Item name="password" label="Ticket password (if set)">
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------

function PayoutModal({
  shiftId,
  storeId,
  open,
  onClose,
}: {
  shiftId: string
  storeId: number
  open: boolean
  onClose: () => void
}) {
  const { message } = App.useApp()
  const cats = usePayoutCategories(storeId)
  const createPayout = useCreatePayout()
  const [form] = Form.useForm()

  return (
    <Modal
      title="Pay out"
      open={open}
      onCancel={onClose}
      okText="Record payout"
      okButtonProps={{ loading: createPayout.isPending }}
      onOk={async () => {
        const values = await form.validateFields()
        try {
          await createPayout.mutateAsync({
            shiftId,
            cashierUserId: DEFAULT_CASHIER,
            categoryId: values.categoryId,
            amount: Number(values.amount),
            note: values.note || undefined,
          })
          message.success('Payout recorded')
          form.resetFields()
          onClose()
        } catch (e: any) {
          message.error(e?.message ?? 'Failed')
        }
      }}
    >
      <Form layout="vertical" form={form}>
        <Form.Item
          name="categoryId"
          label="Category"
          rules={[{ required: true, message: 'Pick a category' }]}
        >
          <Select
            placeholder="Category"
            options={cats.data?.payoutCategories.map((c) => ({ label: c.label, value: c.id })) ?? []}
          />
        </Form.Item>
        <Form.Item
          name="amount"
          label="Amount"
          rules={[{ required: true, message: 'Amount is required' }]}
        >
          <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="note" label="Note">
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------

function CloseShiftModal({
  shiftId,
  open,
  onClose,
  onClosed,
}: {
  shiftId: string
  open: boolean
  onClose: () => void
  onClosed: (closed: Shift) => void
}) {
  const { message } = App.useApp()
  const closeShift = useCloseShift()
  const totals = useCashTotals(open ? shiftId : null)
  const [form] = Form.useForm()

  const expected = totals.data?.cashDrawerRecap.expectedCashInDrawer ?? 0

  return (
    <Modal
      title="Close shift"
      open={open}
      onCancel={onClose}
      okText="Close shift"
      okButtonProps={{ loading: closeShift.isPending, danger: true }}
      onOk={async () => {
        const values = await form.validateFields()
        try {
          const closed = await closeShift.mutateAsync({
            shiftId,
            closingCashCount: Number(values.closingCashCount),
            closingDepositCount: Number(values.closingDepositCount) || 0,
            closedByUserId: DEFAULT_CASHIER,
            managerPassword: values.managerPassword || undefined,
          })
          message.success('Shift closed')
          form.resetFields()
          onClosed(closed)
        } catch (e: any) {
          message.error(e?.message ?? 'Failed to close shift')
        }
      }}
    >
      <Form
        layout="vertical"
        form={form}
        initialValues={{ closingDepositCount: 0, closingCashCount: expected }}
      >
        <Descriptions size="small" column={1} colon={false} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Expected in drawer">
            ${expected.toFixed(2)}
          </Descriptions.Item>
          <Descriptions.Item label="Tickets">
            {totals.data?.salesRecap.ticketCount ?? 0} (
            {totals.data?.salesRecap.voidedTicketCount ?? 0} voided)
          </Descriptions.Item>
        </Descriptions>
        <Form.Item
          name="closingCashCount"
          label="Counted cash in drawer"
          rules={[{ required: true, message: 'Required' }]}
        >
          <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="closingDepositCount" label="Deposit pulled">
          <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="managerPassword" label="Manager password (if set)">
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------

function CashTotalsDrawer({
  shiftId,
  open,
  onClose,
}: {
  shiftId: string
  open: boolean
  onClose: () => void
}) {
  const totals = useCashTotals(open ? shiftId : null)

  return (
    <Drawer title="Cash totals" open={open} onClose={onClose} width={420}>
      {!totals.data ? (
        <Empty />
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card size="small" title="Sales recap">
            <Descriptions size="small" column={1} colon={false}>
              <Descriptions.Item label="Gross sales">
                ${totals.data.salesRecap.grossSales.toFixed(2)}
              </Descriptions.Item>
              <Descriptions.Item label="Returns">
                ${totals.data.salesRecap.returns.toFixed(2)}
              </Descriptions.Item>
              <Descriptions.Item label="Net sales">
                ${totals.data.salesRecap.netSales.toFixed(2)}
              </Descriptions.Item>
              <Descriptions.Item label="Tax">
                ${totals.data.salesRecap.taxTotal.toFixed(2)}
              </Descriptions.Item>
              <Descriptions.Item label="Tickets">
                {totals.data.salesRecap.ticketCount}
              </Descriptions.Item>
            </Descriptions>
          </Card>
          <Card size="small" title="Cash drawer recap">
            <Descriptions size="small" column={1} colon={false}>
              <Descriptions.Item label="Opening float">
                ${totals.data.cashDrawerRecap.openingCashFloat.toFixed(2)}
              </Descriptions.Item>
              <Descriptions.Item label="Cash tenders">
                ${totals.data.cashDrawerRecap.cashTenders.toFixed(2)}
              </Descriptions.Item>
              <Descriptions.Item label="Payouts">
                ${totals.data.cashDrawerRecap.payouts.toFixed(2)}
              </Descriptions.Item>
              <Descriptions.Item label="Expected in drawer">
                <strong>${totals.data.cashDrawerRecap.expectedCashInDrawer.toFixed(2)}</strong>
              </Descriptions.Item>
            </Descriptions>
          </Card>
          <Card size="small" title="Tender breakdown">
            <List
              size="small"
              dataSource={totals.data.tenderBreakdown}
              locale={{ emptyText: 'No tenders yet' }}
              renderItem={(t) => (
                <List.Item>
                  <span>{t.label} ({t.count})</span>
                  <strong>${t.amount.toFixed(2)}</strong>
                </List.Item>
              )}
            />
          </Card>
        </Space>
      )}
    </Drawer>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString()
}

// ---------------------------------------------------------------------------

function SalesPasswordModal({
  storeId,
  open,
  onClose,
}: {
  storeId: number
  open: boolean
  onClose: () => void
}) {
  const { message } = App.useApp()
  const [managerStatus, setManagerStatus] = useState<{ set: boolean; updatedAt: string | null } | null>(null)
  const [ticketStatus, setTicketStatus] = useState<{ set: boolean; updatedAt: string | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchSalesPasswordStatus(storeId, 'MANAGER'),
      fetchSalesPasswordStatus(storeId, 'TICKET'),
    ])
      .then(([m, t]) => {
        if (!cancelled) {
          setManagerStatus(m)
          setTicketStatus(t)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, storeId])

  async function handleRotate(kind: 'MANAGER' | 'TICKET', value: string) {
    if (!value) {
      message.warning('Enter a new password')
      return
    }
    try {
      await setSalesPassword(storeId, kind, value, DEFAULT_CASHIER)
      message.success(`${kind} password updated`)
      form.resetFields([kind === 'MANAGER' ? 'managerPassword' : 'ticketPassword'])
      const fresh = await fetchSalesPasswordStatus(storeId, kind)
      if (kind === 'MANAGER') setManagerStatus(fresh)
      else setTicketStatus(fresh)
    } catch (e: any) {
      message.error(e?.message ?? 'Failed to rotate password')
    }
  }

  return (
    <Modal
      title="Change sales passwords"
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
      confirmLoading={loading}
    >
      <Typography.Paragraph type="secondary">
        Shift-level shared passwords for register operations. Manager password gates close-shift /
        manager options / pay outs. Ticket password gates mid-ticket void, refunds, price overrides.
        Distinct from per-user login passwords (RICS p. 52).
      </Typography.Paragraph>

      <Form form={form} layout="vertical">
        <Typography.Title level={5} style={{ marginBottom: 4 }}>
          Manager password
        </Typography.Title>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          {managerStatus?.set
            ? `Set · last rotated ${formatDate(managerStatus.updatedAt)}`
            : 'Not set — any user can close shift + approve manager actions'}
        </Typography.Text>
        <Space.Compact block>
          <Form.Item name="managerPassword" style={{ flex: 1, marginBottom: 0 }}>
            <Input.Password autoComplete="new-password" placeholder="New manager password" />
          </Form.Item>
          <Button
            type="primary"
            onClick={async () => {
              const v = form.getFieldValue('managerPassword')
              await handleRotate('MANAGER', v)
            }}
          >
            Rotate
          </Button>
        </Space.Compact>

        <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 4 }}>
          Ticket password
        </Typography.Title>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          {ticketStatus?.set
            ? `Set · last rotated ${formatDate(ticketStatus.updatedAt)}`
            : 'Not set — any cashier can void / refund / override price'}
        </Typography.Text>
        <Space.Compact block>
          <Form.Item name="ticketPassword" style={{ flex: 1, marginBottom: 0 }}>
            <Input.Password autoComplete="new-password" placeholder="New ticket password" />
          </Form.Item>
          <Button
            type="primary"
            onClick={async () => {
              const v = form.getFieldValue('ticketPassword')
              await handleRotate('TICKET', v)
            }}
          >
            Rotate
          </Button>
        </Space.Compact>
      </Form>
    </Modal>
  )
}
