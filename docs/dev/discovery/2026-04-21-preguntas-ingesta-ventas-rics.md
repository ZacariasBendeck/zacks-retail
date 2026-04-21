# Preguntas para el Gerente de IT — Ingesta de ventas desde RICS

**Fecha:** 2026-04-21
**Propósito:** Entender cómo llegan hoy las ventas de cada tienda al sistema central RICS, para diseñar el mecanismo por el cual Zack's Retail recibirá esas mismas ventas durante la Fase A (las cajas de las tiendas siguen corriendo RICS sin cambios).
**Referencias RICS:** Manual v7.7, Capítulo 13, páginas 173–182 (Call POS Registers, Poll POS Registers via Internet, Copy To/From POS Diskette, Import Internet Sales).

---

## 1. Arquitectura física de las cajas

1. ¿Cuántas tiendas tienen RICS instalado hoy? ¿Cuántas cajas (registradoras) por tienda?

2. En cada tienda, ¿cada caja tiene su propia instalación de RICS con sus propios archivos `.MDB`, o varias cajas comparten un servidor local (un "servidor de tienda")?

3. ¿Dónde se guardan físicamente los archivos `.MDB` de cada tienda? (p. ej., disco local de cada caja, servidor Windows en la trastienda, NAS, carpeta compartida, etc.)

4. ¿Todas las tiendas corren la misma versión de RICS (v7.7)? ¿Hay personalizaciones (campos extra, reportes especiales, integraciones) hechas por tienda?

---

## 2. Cómo llegan las ventas al set central (`E:\data\rics-mdbs\`)

5. ¿Cuál es el mecanismo actual por el que los archivos `.MDB` de cada tienda llegan al set central en `E:\data\rics-mdbs\`? Opciones posibles (marcar la que aplique):

   - [ ] **Poll POS Registers via Internet** (función nativa de RICS, ver manual p. 174) — las cajas empujan archivos zip a un "drop" de internet y la computadora central los recoge.
   - [ ] **Call POS Registers** (modem o cable directo, manual p. 173).
   - [ ] **Copy From POS Diskette** (manual p. 173) — copia manual por diskette/USB.
   - [ ] **Carpeta compartida por red / VPN** — las cajas escriben directamente a un recurso de red centralizado.
   - [ ] **Script programado** (xcopy/robocopy/rsync/tarea programada) que mueve archivos desde cada tienda al servidor central.
   - [ ] **Otro** — describir:

6. ¿Con qué frecuencia se consolida? Es decir, desde que un cajero cierra un ticket en una tienda, ¿cuánto tiempo pasa hasta que esa venta aparece en los `.MDB` centrales? (¿minutos? ¿horas? ¿un día? ¿una semana?)

7. ¿El proceso corre automáticamente (tarea programada, servicio) o lo ejecuta alguien manualmente cada día?

8. ¿Qué archivos `.MDB` específicos contienen los datos de tickets/ventas que se consolidan? (Sospechamos `RITRANS.MDB`, `RITRNSSV.MDB`, posiblemente `RIARTICK.MDB` — favor confirmar la lista completa.)

9. ¿Hay datos de ventas que quedan **solo** en la caja y nunca se consolidan centralmente?

---

## 3. Red e infraestructura en las tiendas

10. ¿Qué tipo de conexión a internet tiene cada tienda? (fibra / cable / DSL / celular; velocidad aproximada; IP fija o dinámica.)

11. ¿Existe VPN entre las tiendas y la oficina central? Si sí, ¿qué tecnología (OpenVPN, IPSec, WireGuard, SD-WAN de un proveedor, etc.) y quién la administra?

12. ¿Las tiendas pueden alcanzar un servidor central por **red privada** (LAN extendida / VPN), o la única conexión es internet público?

---

## 4. Operación, mantenimiento y fallas

13. ¿Quién mantiene hoy el proceso de sincronización? (persona interna, proveedor externo, mixto.)

14. ¿Con qué frecuencia falla la sincronización y cómo se detecta? (monitoreo automático, alguien revisa logs, el operador de tienda llama al darse cuenta, etc.) ¿Hay registros/logs y dónde se guardan?

15. Si una tienda queda sin conexión por varias horas o un día completo, ¿cómo se recupera la sincronización cuando vuelve? ¿Se pierden ventas?

---

## 5. Flujo de vuelta (oficina central → tiendas)

16. ¿La oficina central envía información de vuelta a las cajas hoy? (precios nuevos, promociones, productos nuevos, cambios de inventario, avisos.) Si sí, ¿por qué mecanismo? (Send Data de RICS, copia manual, VPN, otro.)

17. ¿Con qué frecuencia se hace ese envío hacia las tiendas?

---

## 6. Volumen y horarios

18. ¿Cuántos tickets/ventas al día genera en total la cadena completa? (Orden de magnitud — no necesitamos precisión.)

19. ¿En qué horarios operan las tiendas? ¿Hay tiendas con horarios muy distintos entre sí? (Queremos entender cuál es la ventana ideal para correr una sincronización sin interferir con la operación.)

---

## 7. Restricciones y planes a futuro

20. ¿Hay alguna restricción para tocar la configuración o el software de las cajas hoy? (estabilidad, licencia, hardware viejo, contrato con proveedor.) Esto es importante porque Zack's Retail en la Fase A **no cambiará nada en las cajas**; sólo queremos saber qué tan estricto es ese límite.

21. ¿Cuál es el plan a mediano plazo para las cajas? ¿Se quedan con RICS por meses/años o hay un plan paralelo para reemplazarlas?

---

## Notas para el diseño (no son preguntas)

Dependiendo de las respuestas, Zack's Retail extenderá su ETL actual de alguna de estas formas:

- Si las `.MDB` ya se consolidan centralmente por cualquier medio: agregamos las tablas de tickets al ETL existente (`canonicalRicsTables.ts`) y subimos la cadencia de la sincronización. Cambio mínimo.
- Si cada tienda queda aislada y sólo se conecta por internet vía RICS Poll: implementamos el lado "oficina central" del protocolo Poll-via-Internet y procesamos los zips que suben las cajas.
- Si nada se consolida hoy: hay que diseñar también ese paso antes de poder agregar las ventas.

Todas las opciones mantienen la regla de solo lectura contra los MDBs — Zack's Retail **nunca** escribirá de vuelta a RICS.
