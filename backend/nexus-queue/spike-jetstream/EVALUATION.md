# Evaluación de realismo: migración Nexus-Queue → NATS JetStream

> **Pregunta**: ¿el plan de `docs/architecture/nexus-queue-jetstream-migration.md` es realista, o nos estamos fumando tremendo porro?
> **Método**: desk research con fuentes primarias (código fuente de KEDA, nats-server, taskiq y taskiq-nats) + experimentos en vivo contra NATS 2.10 (JetStream) en docker. Ejecutado el 2026-07-03.
> **Cómo reproducir**: `./run_all.sh` (requiere docker + uv + node en el host).

---

## Veredicto

**REALISTA en el núcleo. PORRO en un supuesto concreto del plan — identificado y con salida barata.**

Las claims a nivel de broker que justifican la migración son **todas verdaderas y verificadas en vivo**. La que falla es una suposición de implementación: *"el swap queda contenido detrás de `create_broker()` manteniendo taskiq"*. Eso es falso por arquitectura de taskiq core, no de taskiq-nats — y obliga a resolver el gate de M1 en la opción (c): receiver propio sobre `nats-py`.

---

## Resultados de los experimentos (todos ejecutados)

| Exp | Qué verifica | Resultado |
|---|---|---|
| E0 | NATS JetStream + monitoring :8222 arriba | **PASS** |
| E2-A | NAK con delay → redelivery real sin poller | **PASS** — redelivery a los 10.0s exactos (drift 0.0s), headers intactos |
| E2-B | Backoff declarativo del consumer (retry como config, no código) | **PASS** — timeline de deliveries [0s, 2s, 7s], exacto a la config `backoff=[2,5]` |
| **E3** | **LA CLAIM CENTRAL: retry diferido visible para KEDA con flota a cero** | **PASS** — S1: `num_pending=1` sin consumers; S2: `num_ack_pending=1` visible los 60s completos de la ventana NAK con el worker desconectado (muestreado en `/jsz`, la misma fuente que lee KEDA); S3: redelivery al reconectar (`num_delivered=2`) |
| E4 | Agotamiento `max_deliver` → captura para DLQ | **PASS** — advisory `$JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES` recibido + mensaje completo (payload+headers) recuperable por `stream_seq` + registro publicado en subject DLQ |
| E5 | Cross-language TS→Python: headers íntegros + dedup `Nats-Msg-Id` | **PASS** — 4 headers `nq_*` íntegros; segundo publish con mismo msgID marcado `duplicate=true` y NO añadido al stream |
| E6 | Handlers largos vs `ack_wait`: heartbeat `in_progress()` | **PASS** — con extensión: `num_delivered=1` (handler 12s, ack_wait 5s); control sin extensión: redelivery espuria a los ~4s (confirma que el riesgo es real y la mitigación funciona) |
| E1 | ¿Cabe el NAK-nativo en taskiq? | **CONFIRMADO QUE NO** — `AckableMessage = {data, ack}`; `listen()` no expone metadata ni headers NATS. Los labels `nq_*` SÍ viajan íntegros en el body (wire contract sobrevive) |
| E7 | Contrato→codegen (D13) con una cola real | **PASS** — de un `contract.yaml` se generan coherentes: `models.py` (pydantic), `types.ts` (zod), `stream.json`, `consumer.json`, `scaledobject.yaml` |

## Desk research (fuentes primarias, dos agentes independientes)

### KEDA scaler `nats-jetstream` — la claim central es VERDADERA, con matices

Verificado en el código fuente de KEDA (`nats_jetstream_scaler.go`) y de nats-server (`consumer.go`):

- **Lag = `num_pending + num_ack_pending`** del consumer. Un mensaje NAK-eado con delay permanece en `o.pending` del *servidor* (sin clientes conectados) y cuenta como `num_ack_pending` → KEDA lo ve durante todo el delay. Nuestro E3 lo confirma empíricamente.
- Este comportamiento existe **desde KEDA v2.9** (PR #3809, que arregló exactamente nuestro escenario: issue #3787 — "mensajes en retry invisibles al scaler"). **En v2.8 la claim era literalmente falsa.** Suelo real recomendado: **≥ 2.15.1** (fix de leader-change en clúster) e idealmente **≥ 2.20** (consumer inexistente → error en vez de escalar a max).
- **Matiz de eficiencia**: como la señal es >0 durante *todo* el delay, con `activationLagThreshold: 0` la flota **no llega a dormirse** mientras haya un retry pendiente — KEDA mantiene 1 réplica (garantía mejor de lo prometido, ahorro menor de lo prometido). Subir el threshold recupera el ahorro pero reabre el riesgo para ese único mensaje. Decisión por perfil en el contrato.
- **Los mensajes que agotan `max_deliver` desaparecen del lag** (el server los saca de `pending`). El DLQ vía advisory (E4) no es opcional: sin él, un mensaje agotado es invisible para KEDA *y* para el worker. Coincide con el diseño del plan.
- El scaler solo necesita el **endpoint HTTP de monitoring (8222)** — sin credenciales NATS (ojo: el endpoint no tiene auth; NetworkPolicy obligatoria). El consumer debe ser **durable y existir independientemente de los workers** — exactamente lo que los CRDs de NACK dan por diseño (validación indirecta de esa pieza del plan).

### taskiq / taskiq-nats — el supuesto roto

- **taskiq-nats está efectivamente sin mantener**: última release funcional nov-2024; la única release en 19 meses es tooling; PRs de comunidad ignorados 3-4 meses; bugs abiertos sin respuesta (#20, #23); el bug de tasks largas (#16, duplicados cada ~`ack_wait`) cerrado sin fix. ~520 líneas totales; el broker pull son ~45 líneas sobre nats-py.
- **El blocker es taskiq core, no el plugin**: `AckableMessage` solo modela `ack`; el receiver ackea **incluso tasks fallidas** (excepción capturada en `TaskiqResult.is_err` sin propagar). No hay dónde enchufar NAK/term/in_progress en el pipeline de taskiq — subclassear el broker no lo arregla. Confirmado por lectura de fuente (agente) y estructuralmente en vivo (E1).
- Consecuencia: **manteniendo taskiq, los reintentos serían re-kicks de middleware** (mensaje nuevo, delivery count reseteado)… y JetStream **no tiene delayed publish**, así que el retry diferido re-necesitaría un poller. Es decir: con taskiq, la migración pierde exactamente la elegancia que la justifica.

## Impacto en el plan (lo que hay que enmendar)

1. **El gate de M1 queda resuelto por adelantado: opción (c)** — receiver propio sobre `nats-py` en el lado worker. No es el drama que suena:
   - Las semánticas que necesita (fetch loop, dispatch, NAK con delay en `NexusRetryableError`, TERM+DLQ en permanente, `in_progress` heartbeat, listener de advisories) están **todas validadas en vivo** en este spike con nats-py directo — E2, E3, E4, E6 *son* el esqueleto de ese receiver.
   - La superficie pública de nexus-queue (handlers, payloads tipados, puertos, publisher, kicker) sobrevive; lo que se reemplaza es la capa receiver/broker de taskiq (~centenares de líneas, no millares). El patrón pull de taskiq-nats (45 líneas) sirve de referencia copiable.
   - El wire contract sobrevive verificado: labels en el body (E1) + headers NATS para dedup (E5).
2. **M3 cambia de alcance**: de "branch en `create_broker()`" a "receiver propio + branch en publisher". Estimación sube (días, no semanas); el resto de fases no se mueve.
3. **Suelo de versión KEDA** explícito en M7: ≥ 2.15.1 (ideal ≥ 2.20).
4. **Matiz al criterio de éxito #5**: el retry diferido con flota a cero *se procesa solo* (verificado), pero el ahorro de scale-to-zero durante ventanas de backoff es menor de lo prometido (1 réplica idle salvo threshold >0). Ajustar la expectativa económica, no la técnica.
5. **Aprendizajes operativos del spike** (para el chart/codegen): retention `workqueue` admite UN solo consumer por subject (el codegen E7 ya emite `limits` por esto + el DLQ listener lo requiere); el advisory de MAX_DELIVERIES se emite al evaluar la redelivery (con workers haciendo fetch siempre presente en producción, pero el listener DLQ no debe asumir emisión instantánea).

## Reglas de decisión usadas

- **PORRO** si E3-S2 fallaba (la grieta de scale-to-zero existiría también en NATS) o si los headers no sobrevivían cross-language (wire contract roto). → No ocurrió.
- **REALISTA** si las claims broker-level pasaban y el coste extra descubierto quedaba acotado (opción c ≈ días). → Es donde estamos.
- **Pendiente para M1 real** (no bloqueante para decidir): prueba end-to-end con KEDA de verdad en un cluster (HPA incluido — el agente lo señala como inferido, no probado), y el prototipo de receiver propio consumiendo un handler real de nexus-queue.
