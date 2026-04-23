# Purchasing Workflow Testing Checklist

## Propósito

Este checklist asegura que el módulo de purchasing en Zack’s Retail replica completamente el comportamiento de RICS y es seguro para el cutover.

Cada prueba debe validarse contra comportamiento real de RICS y datos reales.

---

## 1. Purchase Order Creation (Flujo principal)

- [ ] Crear Purchase Order con header válido (vendor, bill-to, ship-to)
- [ ] Generación de PO number sigue el formato esperado
- [ ] Entrada manual de PO number funciona (letras + números)
- [ ] Prefijos reservados (A, V) manejados correctamente
- [ ] Valores por defecto (terms, ship-via, etc.) se cargan correctamente
- [ ] Header fields pueden ser override correctamente
- [ ] Comments se guardan correctamente

---

## 2. SKU Line Entry (Flujo UX CRÍTICO)

- [ ] Flujo secuencial de SKU entry funciona correctamente
- [ ] SKU counter incrementa correctamente
- [ ] Cada SKU se guarda de forma independiente
- [ ] Editar un SKU ya agregado funciona correctamente
- [ ] Eliminar SKU reenumera correctamente
- [ ] Descripción del SKU coincide con product data esperado

---

## 3. Size Grid / Case Pack

- [ ] Size grid coincide con el size type del SKU
- [ ] Size grids 1D y 2D se renderizan correctamente
- [ ] Case pack auto-fill funciona correctamente
- [ ] Multiplier (X__) funciona correctamente
- [ ] Overrides manuales en size cells funcionan correctamente
- [ ] Cambiar case pack recalcula cantidades correctamente
- [ ] Se muestra warning al sobrescribir cambios manuales

---

## 4. Pricing & Cost

- [ ] Retail price se guarda correctamente
- [ ] Cost se guarda correctamente
- [ ] Overrides de precio no corrompen SKU master
- [ ] Comportamiento de write-back-to-master funciona correctamente
- [ ] Pricing se mantiene después de save/load

---

## 5. Edición después de Receiving (Comportamiento clave de RICS)

- [ ] Editar PO después de partial receive muestra cantidades originales
- [ ] Editar establece valor absoluto (no delta)
- [ ] Remaining quantity se recalcula correctamente
- [ ] No ocurren over-receipts accidentales

---

## 6. Duplicate / Replicate / Combine

### Duplicate
- [ ] Duplicar PO crea nuevo PO correctamente
- [ ] Header values se copian correctamente
- [ ] Lines se copian correctamente
- [ ] Nuevo PO es editable

### Replicate
- [ ] Replication crea PO numbers correctos por store
- [ ] Duplicados se saltan correctamente
- [ ] Todos los replicated POs son válidos
- [ ] Resultado muestra created vs skipped

### Combine
- [ ] Combine de POs fusiona lines correctamente
- [ ] PO origen se elimina
- [ ] PO destino contiene todos los lines
- [ ] No hay pérdida de datos

---

## 7. Receiving (CRÍTICO)

### Manual Receiving
- [ ] Partial receiving funciona correctamente
- [ ] Full receiving funciona correctamente
- [ ] Remaining quantities se manejan correctamente
- [ ] Discount % ajusta cost correctamente
- [ ] Freight ajusta cost correctamente
- [ ] Negative quantity corrige over-receipt
- [ ] No se puede recibir SKU no incluido en PO (salvo casos permitidos)

### Scan Mode
- [ ] UPC scan incrementa size cell correcta
- [ ] Scan session funciona correctamente
- [ ] End session finaliza correctamente

---

## 8. ASN Cartons

- [ ] Scan de ASN carton recibe todos los items correctamente
- [ ] Contenido del carton coincide con SKUs esperados
- [ ] Label generation funciona correctamente
- [ ] Ediciones manuales del carton se reflejan correctamente
- [ ] Receive del carton es idempotente (no duplicado)

---

## 9. PO Status Lifecycle

- [ ] DRAFT → SUBMITTED funciona
- [ ] SUBMITTED → CONFIRMED funciona
- [ ] Partial receive cambia a PARTIALLY_RECEIVED
- [ ] Full receive cambia a RECEIVED
- [ ] Cancel funciona correctamente
- [ ] Status history se registra correctamente

---

## 10. Automatic Purchase Orders

- [ ] Auto PO detecta shortages correctamente
- [ ] Model quantity logic es correcta
- [ ] Cálculo de on-hand + on-order es correcto
- [ ] Reorder rounding funciona correctamente
- [ ] Filtros (vendor/category) funcionan correctamente
- [ ] Combine-to-store funciona correctamente
- [ ] Preview coincide con commit real
- [ ] Generated POs son válidos

---

## 11. Order Worksheet

- [ ] Totales del worksheet coinciden con inputs
- [ ] Size distribution suma 100%
- [ ] SKU lines se guardan correctamente
- [ ] Materialize to PO funciona correctamente
- [ ] PO generado coincide con datos del worksheet

---

## 12. Reset Future Orders

- [ ] Lógica de threshold funciona correctamente
- [ ] POs se clasifican correctamente como At-Once vs Future
- [ ] Reset manual funciona correctamente
- [ ] Reset automático funciona correctamente

---

## 13. On-Order Accuracy (CRÍTICO)

- [ ] On-order coincide con PO lines esperados
- [ ] On-order refleja partial receiving
- [ ] On-order desaparece después de full receive
- [ ] On-order coincide con comportamiento de RICS
- [ ] On-order a nivel de size es correcto

---

## 14. Reports

### Purchase Orders Report
- [ ] Sorting funciona (store, vendor, date)
- [ ] Filtros funcionan correctamente
- [ ] Vista Ordered vs Open es correcta
- [ ] Totales coinciden

### Open PO by Month
- [ ] Distribución por mes es correcta
- [ ] Proyección de cost y retail es correcta
- [ ] Agrupación por vendor/category funciona

### Cash Projection
- [ ] Proyección por payment date es correcta
- [ ] Totales coinciden

---

## 15. Integración con Inventory

- [ ] Receiving genera movimientos de inventory
- [ ] On-hand se actualiza correctamente
- [ ] Cost updates se propagan correctamente
- [ ] Movement ledger coincide con actividad de PO

---

## 16. Validación de Migración

- [ ] Todos los POs legacy se importan correctamente
- [ ] No hay POs faltantes
- [ ] No hay POs duplicados
- [ ] Status se preserva correctamente
- [ ] On-order coincide con RICS
- [ ] SKU linkage es correcto

---

## 17. Edge Cases

- [ ] Over-receipt correction funciona correctamente
- [ ] Partial cancellation funciona correctamente
- [ ] Duplicate PO numbers se previenen
- [ ] Missing vendor se maneja correctamente
- [ ] Invalid SKU es bloqueado correctamente
- [ ] POs grandes funcionan correctamente

---

## 18. Performance

- [ ] PO load time es aceptable
- [ ] Edición de POs grandes es rápida
- [ ] Auto PO jobs son rápidos
- [ ] Reports cargan rápidamente

---

## 19. Validación de Usuario (Operator Validation)

- [ ] Buyer puede crear POs fácilmente
- [ ] Buyer puede recibir sin confusión
- [ ] Flujo de warehouse funciona correctamente
- [ ] No hay problemas de usabilidad críticos

---

## Final Readiness Check

Cutover permitido solo si:

- [ ] Todos los flujos críticos PASS
- [ ] No hay FAIL de alto impacto
- [ ] On-order es consistente con RICS
- [ ] Receiving se comporta igual que RICS
- [ ] Usuarios confirman que el sistema funciona