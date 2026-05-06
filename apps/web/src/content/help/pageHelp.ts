import type { PageHelpEntry } from '../../components/page-help'

export const inventoryAuditHelp: PageHelpEntry = {
  id: 'inventory-audit',
  title: 'Auditoría de inventario',
  module: 'Inventario',
  processSteps: [
    'Escoge el SKU con el buscador o escribe el código exacto.',
    'Escoge la tienda que quieres auditar y revisa el on-hand actual.',
    'Lee el resumen para ver balance inicial, movimientos, delta neto y reconciliación.',
    'Inspecciona el ledger de movimientos en orden cronológico, incluyendo ventas POS.',
    'Si no reconcilia, revisa si el límite de filas fue alcanzado o si falta recargar la data importada.',
  ],
  philosophy:
    'Esta página existe para probar por qué el inventario actual es correcto. No confía solamente en un número estático; reconstruye el saldo desde recibos, transferencias, devoluciones, conteos físicos y ventas.',
  manualLinks: [
    { label: 'Abrir manual de Inventario', to: '/manual/inventory' },
    { label: 'Ver sección Inventory Audit', to: '/manual/inventory#inventory-audit' },
  ],
}

export const purchaseOrderEntryHelp: PageHelpEntry = {
  id: 'purchase-order-entry',
  title: 'Nueva orden de compra',
  module: 'Compras',
  processSteps: [
    'Escoge vendor, tienda de facturación, tienda de destino y comprador en el encabezado.',
    'Completa fechas, moneda, términos y datos de importación solo cuando aplican al PO.',
    'Agrega líneas por SKU y captura cantidades por size grid o case pack.',
    'Revisa costos, cantidades y subtotal antes de guardar.',
    'Guarda el PO como borrador para revisión, recepción futura o combinación con otros borradores.',
  ],
  philosophy:
    'El flujo de compra se queda en Compras: aquí se define qué se ordena, a quién y para qué tienda. Import Management puede aportar costo aterrizado y contexto de embarque, pero no cambia la propiedad del PO.',
  manualLinks: [
    { label: 'Abrir manual de Compras', to: '/manual/purchasing' },
  ],
  tabNotes: [
    {
      key: 'header',
      label: 'Tab Header',
      processSteps: [
        'Define vendor, tiendas, comprador, clasificación y fechas.',
        'Usa moneda y FX cuando el costo venga de una compra internacional.',
      ],
      philosophy:
        'El header debe explicar la intención comercial del PO antes de capturar unidades.',
    },
    {
      key: 'lines',
      label: 'Líneas y tallas',
      processSteps: [
        'Agrega SKU por SKU.',
        'Distribuye cantidades en la matriz de tallas o aplica un case pack.',
        'Revisa que el costo usado sea el correcto antes de guardar.',
      ],
      philosophy:
        'Las cantidades viven al nivel de size grid para que recepción, on-order e inventario puedan reconciliar por talla.',
    },
  ],
}

export const inventoryCloseHelp: PageHelpEntry = {
  id: 'inventory-close',
  title: 'Inventory close',
  module: 'Operations',
  processSteps: [
    'Run the weekly dry run after the last sale of the week has posted.',
    'Run the weekly close only when validation passes.',
    'Run the monthly dry run after the last sale of the month has posted.',
    'Run the monthly close only when validation passes and management is ready to freeze the period.',
    'Review the run history after each close.',
  ],
  philosophy:
    'The close freezes RICS-compatible inventory history projections used by reports and inquiry. ROI and turns stay as calculated report metrics, so this process closes the source counters without storing those ratios.',
  manualLinks: [
    { label: 'Inventory manual', to: '/manual/inventory#inventory-close' },
    { label: 'Sales reporting manual', to: '/manual/sales-reporting' },
    { label: 'Platform manual', to: '/manual/platform#inventory-close' },
  ],
}
