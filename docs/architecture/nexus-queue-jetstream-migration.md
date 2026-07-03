# Nexus-Queue: migración del transporte a NATS JetStream + visión contract-first

> **Estado**: propuesta consolidada (2026-07-03), pendiente de ratificar.
> **Evaluación de realismo ejecutada** (mismo día): banco reproducible en `backend/nexus-queue/spike-jetstream/` (veredicto completo en su `EVALUATION.md`). Todas las claims a nivel de broker verificadas en vivo (E2–E7 PASS, incluida la central de scale-to-zero); un supuesto de implementación resultó falso y queda enmendado aquí (D7 resuelta, D14 nueva, M1 ejecutada, M3 redefinida).
> **Fuentes**: informes Nexus-Queue 1/3, 2/3, 3/3 y anexo "Si migrásemos de Redis" + discusión posterior + spike.
> **Decisión central**: reemplazar Redis Streams por NATS JetStream como transporte de cola **antes** de construir la capa de plataforma (chart, KEDA, CLI), y evolucionar el estándar hacia un modelo contract-first ("OpenAPI de colas") con un **runtime v2 sin taskiq** (D14).

---

## 0. Resumen ejecutivo

1. **Se migra el transporte de cola** de Redis Streams a NATS JetStream. Redis **no se desmantela**: queda como cache e idempotency store. Lo que se va es Redis como pieza stateful crítica de la cola.
2. **La secuencia del informe 3/3 se invierte**: la migración va **antes** de F4–F6 (chart, KEDA, CLI). Construir la plataforma sobre Redis y migrar después es pagar dos veces: la alineación `XAUTOCLAIM`/idle-timeout/cooldown, el tooling alrededor del `DelayedRetryPoller` y el trigger de KEDA para Redis Streams son coste hundido garantizado.
3. **La suite de conformidad mínima (F7-mínimo) se adelanta a primera posición**: es a la vez el guardián del estándar mientras dura la obra y el **test de aceptación del cutover**. Un estándar sin verificación automática se erosiona con el primer deadline — y una migración sin test de aceptación es una afirmación, no un estado verificado.
4. **El estándar evoluciona a contract-first**: un contrato YAML por cola (estilo AsyncAPI) del que se generan tipos TS, modelos pydantic, CRDs de NACK, ScaledObjects de KEDA, tests de conformidad y documentación. El contrato *es* el sistema; runtime e infra son proyecciones.
5. **El wire contract v1 sobrevive intacto** (verificado en vivo, spike E1/E5) — los labels `nq_*` viajan en el mensaje, no en el transporte; `nq:{p}:{q}` mapea mecánicamente a `nq.{p}.{q}`. El formato le sobrevive a la librería que lo inspiró: desde v1.1 su forma la define **nuestra spec**, no taskiq.
6. **taskiq sale del runtime (D14)**: el spike demostró que su modelo de acks no puede expresar la semántica JetStream (NAK/term/in_progress) — el "swap contenido detrás de `create_broker()`" era falso en el lado worker. El contrato asume el rol de definición de tasks; un receiver propio sobre `nats-py` (semánticas ya validadas en vivo) asume el runtime; la DLQ pasa de middleware a listener de advisories + clasificación en el receiver.

---

## 1. Decisión y alcance

### Qué se reemplaza

| Papel de Redis hoy | Destino |
|---|---|
| Redis Streams como transporte (`nq:{p}:{q}`, consumer groups, `XACK`/`XAUTOCLAIM`) | **NATS JetStream** (subjects `nq.{p}.{q}`, durable consumers, ack explícito) |
| ZSET `nq:*:delayed` + `DelayedRetryPoller` (`delayed.py`) | **Eliminado** — NAK con delay / backoff declarativo del consumer, nativo del broker |
| Redis como cache | **Se queda** |
| Redis como idempotency store (dedup `nq_idem`) | **Se queda** |

### Reconocimiento honesto del timing

Ninguno de los triggers medibles del anexo ha disparado todavía (scale-to-zero como default, flota >6–8 colas, inspector cross-proyecto diario, tercer proyecto greenfield). Migrar ahora es pagar el coste antes de cobrar el beneficio — **y aun así es la decisión correcta si la visión de flota va en serio**, porque la ventana barata es *antes* de F4–F6: cada mes de tooling construido sobre el transporte equivocado encarece la migración. Lo que sería indefendible es migrar *y además* construir F4–F6 sobre Redis en paralelo "por si acaso": eso es pagar las dos facturas.

---

## 2. Justificación técnica

### 2.1 Las tres grietas estructurales de Redis Streams

**Scale-to-zero roto por diseño.** El retry con backoff vive en un ZSET lateral (`nq:*:delayed`) con un poller que corre *dentro del worker*. Cadena de fallo: flota a cero → mensaje diferido espera en el ZSET → el scaler de KEDA para Redis Streams mira stream + pending del consumer group, **no el ZSET** → nadie despierta al worker → retry atascado hasta que llegue tráfico nuevo. Todo parche (segundo scaler, poller como Deployment aparte, `minReplicas: 1`) es exactamente la maquinaria que la plataforma quería eliminar. En JetStream el mensaje diferido vive en el consumer como pendiente, la señal de lag lo ve, y KEDA levanta el worker.

**Federación como script, no como primitiva.** El tooling de flota sobre Redis es N conexiones y N credenciales. NATS tiene *accounts* (aislamiento multi-tenant real) y *leaf nodes* (federación sin dominio de fallo compartido) como primitivas — el inspector de DLQ y el dashboard pasan de "script que itera Redises" a suscripciones sobre subjects exportados.

**Proliferación stream-por-cola.** "Un worker dedicado solo a transcripción" en Redis = otro stream + otro ScaledObject. En NATS = un filtro sobre la jerarquía de subjects (`nq.nixon.jobs.transcribe`, wildcards `nq.nixon.jobs.>`). Justo donde el modelo actual empieza a pesar cuando la flota crece.

### 2.2 Matiz importante: qué NO gana la migración

El dedup por `Nats-Msg-Id` es **publish-side y con ventana corta** (2 min por defecto): protege contra doble-publish, no contra redeliveries al consumer (que llegan igual vía `ack_wait`/`max_deliver`). Por tanto:

> **`nq_idem` sigue siendo el muro de carga.** La idempotencia de handlers es contrato, no cortesía, en Redis y en NATS por igual. Nada se relaja tras la migración en este punto.

### 2.3 Por qué la elegancia también cuenta (y tiene nombre)

En Redis Streams la cola es **implícita**: existe porque alguien hizo `XADD`; su configuración está repartida entre código de productor, consumer, middleware y convenciones laterales. La topología es emergente — para saber qué hay, se lee código.

En JetStream, Streams y Consumers son **objetos declarados con schema explícito**: subjects, retención, storage, ventana de dedup, `ack_wait`, `max_deliver` y — clave — **el schedule de backoff como lista declarativa** (`backoff: ["30s", "2m", "10m"]`). La política de reintentos que hoy vive en middleware pasa a ser configuración del contrato, versionable e inspeccionable (`nats stream info` devuelve la topología como datos). Con **NACK** (controller oficial de NATS para K8s), Streams y Consumers son **CRDs**: la topología de colas son manifiestos en Git que ArgoCD sincroniza — el mismo carril GitOps que todo lo demás.

Esa es la condición necesaria para el objetivo estético del estándar: un contrato tipo **AsyncAPI** ("OpenAPI de colas") que sea *ejecutable*, no aspiracional. Sobre Redis, el contrato describiría intenciones que el runtime implementa a mano; sobre JetStream, describe configuración que el broker ejecuta.

---

## 3. La visión contract-first

### 3.1 El contrato por cola

Un fichero por cola, fuente única de verdad. La estructura toma prestada la descomposición de AsyncAPI — *channels / operations / messages / servers / bindings* — porque cada separación resuelve un problema concreto nuestro:

```yaml
# contracts/nq.nixon.jobs.transcribe.yaml
channel: nq.nixon.jobs.transcribe
operations:                  # quién habla — alimenta el manifest del worker (M6) y el tooling de flota
  send:    [nixon-web]       # productores (TS)
  receive: [transcribe-worker]
message:
  payload:
    $ref: "./schemas/TranscribeJob.json"     # JSON Schema
  headers:
    nq_idem:  { type: string, required: true }
    nq_trace: { type: string }
policy:                      # semántica transport-agnostic: cada adapter la proyecta
  retry: { backoff: [30s, 2m, 10m], max_attempts: 4 }
  dlq: nq.nixon.jobs.dlq
  processing_budget: 25m     # handlers largos → NATS: ack_wait; Redis: idle timeout
scaling:
  profile: batch             # batch | latency-sensitive
  scaleToZero: true
bindings:                    # SOLO detalles genuinos de transporte
  jetstream:
    stream: NQ_NIXON_JOBS
    deliver_policy: all
# servers: fuera del contrato a propósito — URLs y credenciales del broker son
# por entorno y viven en GitOps (values/env.json), como la sección `servers` de AsyncAPI
```

Tres separaciones deliberadas:

- **`policy` habla semántica, no NATS.** `max_attempts` y `processing_budget` en vez de `max_deliver` y `ack_wait`: la política de reintentos y presupuesto de procesado es parte del estándar con independencia del transporte; cada adapter la *proyecta* (NATS: consumer `backoff`/`max_deliver`/`ack_wait`; Redis: middleware + ZSET + idle timeout).
- **`bindings` es la única sección que un swap de transporte reescribe.** Esto convierte la decisión D5 (transport-agnostic swappable) en una propiedad estructural del documento, no en una aspiración: la prueba de que el contrato está bien factorizado es que migrar de transporte no toca `channel`, `operations`, `message` ni `policy`.
- **`operations` declara quién publica y quién consume.** De ahí se deriva el manifest del worker de M6 (un worker declara qué contratos sirve), el tooling de flota puede responder "¿qué apps tocan esta cola?", y el codegen distingue tipos de productor de tipos de consumer.

### 3.2 Proyecciones generadas (no mantenidas a mano)

| Proyección | Herramienta | Consume |
|---|---|---|
| Tipos TS del productor | JSON Schema → zod/types (o Modelina) | `message.payload` |
| Modelos pydantic del handler | datamodel-code-generator (o Modelina) | `message.payload` |
| CRDs NACK (Stream + Consumer) | generador propio — AsyncAPI no lo da | `channel` + `policy` + `bindings` |
| ScaledObject KEDA | generador propio — AsyncAPI no lo da | `scaling` |
| Manifest del worker (M6) | derivado, no mantenido a mano | `operations` |
| Validación del contrato en CI | AsyncAPI CLI / spectral (si se adopta el formato) | todo |
| Tests de conformidad (round-trip) | harness F7 parametrizado | todo |
| Docs HTML | tooling AsyncAPI | todo |

**El insight**: esto no es una pieza nueva — es la **convergencia** de tres piezas ya propuestas por separado en el informe 3/3: el *manifest del worker* de F4 (documentación ejecutable), los *payloads tipados* que el SDK ya tiene, y la *suite de conformidad* de F7. Contract-first las convierte en proyecciones de un mismo documento en vez de artefactos paralelos que hay que mantener sincronizados. Publicar un payload que no compila se vuelve imposible en ambos lados del wire.

### 3.3 Relación con AsyncAPI: adoptar el formato vs inspirarse en él

Que la estructura del contrato siga a AsyncAPI no decide todavía si el fichero **es** un documento AsyncAPI 3.0 o un YAML propio. Es una decisión con trade-offs reales, y se resuelve en el spike M1 (D13):

**A favor de adoptar AsyncAPI 3.0 literal** (con extensiones `x-nq-*` para `policy` y `scaling`):
- Tooling existente que dejamos de escribir: validación de documento (AsyncAPI CLI, reglas spectral), generación de modelos (Modelina cubre TS y Python), docs HTML, y un formato que cualquier persona nueva reconoce.
- Longevidad: es el estándar de industria para EDA — el equivalente asíncrono de OpenAPI.

**A favor de YAML propio exportable a AsyncAPI**:
- El binding NATS estándar de AsyncAPI es **fino** (subject/queue): no modela la profundidad JetStream (consumer `backoff`, `max_deliver`, `ack_wait`) — iría en extensiones custom de todos modos.
- Las proyecciones que más nos importan (CRDs NACK, ScaledObject KEDA, manifest del worker) **no las genera AsyncAPI** — son generadores propios en ambos escenarios.
- Un documento AsyncAPI completo es más verboso que un contrato a medida; parte de la "elegancia verbosa" que buscamos es que el fichero se lea entero de un vistazo.

Camino por defecto si M1 no lo desmiente: **YAML propio con export mecánico a AsyncAPI** (la estructura ya es isomorfa), y adoptar el formato literal solo si el tooling heredado (validación + Modelina + docs) compensa la verbosidad. Lo que NO haremos es un formato propio *no* exportable — eso sería renunciar gratis al ecosistema.

Lo que descartamos explícitamente de AsyncAPI: **mocking/simulación de eventos** (Microcks y similares). Nuestra suite de conformidad corre round-trips contra brokers reales en CI — estrictamente más fuerte que validar contra eventos simulados.

### 3.4 Relación con CloudEvents

Se mantiene la decisión del informe 2/3: CloudEvents describe el sobre de *un* mensaje; AsyncAPI describe la *superficie completa* de la API asíncrona. Son complementarios (AsyncAPI referencia CloudEvents como formato de mensaje). Los labels `nq_*` mapean casi 1:1 — el mapping documentado hace que un bridge futuro sea mecánico. No se adopta ninguno como dependencia dura hoy.

---

## 4. Decisiones consolidadas de la discusión

| # | Decisión | Razón |
|---|---|---|
| D1 | Migrar a JetStream **antes** de F4–F6 | Construir la plataforma una vez, contra el transporte definitivo. Después de F4–F6 ya no hay ventana barata. |
| D2 | F7-mínimo **primero**, antes de tocar nada | Guardián anti-drift (así fue como nixon acabó con retries apagados) + test de aceptación del cutover. |
| D3 | **Probes rediseñados**: liveness = salud del proceso (event loop); conectividad al broker = métrica + alerta, **nunca** probe que mata pods | Si el broker parpadea, "readiness/liveness = conectividad" produce una tormenta de restarts sincronizada de toda la flota justo cuando el broker se recupera. Para un consumer, readiness apenas significa nada (no hay tráfico entrante que gatear). |
| D4 | `nq_idem` sigue siendo el muro de carga; `Nats-Msg-Id` es conveniencia publish-side | Ventana de 2 min, no cubre redeliveries. Ver §2.2. |
| D5 | Bloque scaler del chart como **sección swappable de values** (adapter por transporte), aunque nazca NATS | Si el trigger se hornea en el template principal, la promesa transport-agnostic se rompe en la pieza que más cuesta migrar. |
| D6 | **Sin accounts/leaf nodes el día uno**; single-node + file storage, sin RAFT/HA | La federación es dividendo futuro con trigger propio (inspector cross-proyecto como uso diario). HA de 3 nodos solo cuando haya SLA que lo pida. No regalar complejidad. |
| D7 | ~~Spike de `taskiq-nats` timeboxed con gate de decisión~~ **RESUELTA (spike 2026-07-03)**: `taskiq-nats` descartado | Semi-abandonado (1 release de tooling en 19 meses, PRs de comunidad ignorados) y, peor, el blocker es **taskiq core**: `AckableMessage` solo modela `ack` y el receiver ackea incluso tasks fallidas (verificado en fuente y en vivo, E1). Superada por D14. |
| D8 | El spike incluye **prototipo contrato→codegen** de una cola real | Forma más barata de saber si la abstracción contract-first aguanta antes de comprometerse con ella. |
| D9 | Formalizar en la spec el patrón productor: **job en `CREATED` antes de enqueue + sweep de huérfanos** | Es un outbox de facto (endurecido en #237); cubre el dual-write con independencia del transporte. Outbox real solo si un flujo lo exige. |
| D10 | Cola piloto: **batch tolerante a latencia** (transcripción o reindexado) | Riesgo bajo, y es donde el scale-to-zero paga primero. |
| D11 | Regla del dos intacta: **el SDK no crece** durante la migración | Los cuatro puertos (`JobState`, `BlobStore`, `Index`, `StatusEvent`) bastan; ningún puerto nuevo sin segundo consumidor real. |
| D12 | Claim-check vía `BlobStore` pasa de recomendación a **obligación** para payloads grandes | NATS limita el payload a 1 MB por defecto. El publisher valida y rechaza con error tipado. |
| D13 | El contrato adopta la **descomposición de AsyncAPI** (channels/operations/messages/servers/bindings): `policy` semántica transport-agnostic, transporte solo en `bindings`, servers/credenciales fuera (GitOps). El formato literal (AsyncAPI 3.0 con `x-nq-*` vs YAML propio exportable) se decide en M1 | La separación semántica/binding hace estructural la promesa de D5: un swap de transporte reescribe solo `bindings`. `operations` alimenta el manifest del worker y el tooling de flota. Ver §3.3. Prototipo validado en el spike (E7: 5 proyecciones coherentes de un contrato real). |
| D14 | **Runtime v2 sin taskiq.** El contrato asume el rol de definición de tasks (`channel`/`operations`); un **receiver propio sobre `nats-py`** asume el runtime (fetch loop con semáforo, dispatch por `HandlerSpec`, `NexusRetryableError`→NAK, `NexusPermanentError`→TERM+DLQ, heartbeat `in_progress`, listener de advisories→DLQ); el publisher publica el envelope directamente (`js.publish`). taskiq sigue en el lado Redis hasta drenar (M5) y sale de las dependencias al cierre | taskiq no puede expresar la semántica JetStream (E1) y su valor residual era un fetch loop + binder de kwargs: lo valioso del runtime (envelope, naming, idempotencia, puertos, handlers tipados, métricas, tracing) **ya es nuestro** — `handlers.py` ya puenteaba taskiq para el around-scope. Las semánticas del receiver están todas validadas en vivo (E2/E3/E4/E6). El scheduler de taskiq no lo usa nadie (verificado). |

---

## 5. Mapeo del wire contract (Redis → NATS)

| Hoy (Redis Streams) | Con JetStream | Nota |
|---|---|---|
| Stream `nq:{project}:{queue}` | Subject `nq.{project}.{queue}` (stream `NQ_{PROJECT}_{QUEUE}`) | Mapeo mecánico; jerarquía con wildcards |
| `nq:{p}:{q}:cg` (consumer group) | Durable consumer con `filter_subject` | |
| `XACK` | `ack()` explícito | |
| `XAUTOCLAIM` + idle timeout | `ack_wait` + redelivery automática del broker | Desaparece el reclaim manual y su alineación fina |
| ZSET `nq:*:delayed` + `DelayedRetryPoller` | `NAK` con delay / `backoff` declarativo del consumer | **`delayed.py` se elimina** |
| `nq:{p}:{q}:dlq` | Subject `nq.{p}.{q}.dlq` (clasificación en el receiver + listener de advisories, D14) | Señal de agotamiento: `max_deliver` → advisory `MAX_DELIVERIES` (validado E4; el mensaje agotado es invisible para KEDA → el listener no es opcional) |
| `nq:{p}:status` | Subject `nq.{p}.status` | |
| Dedup solo aplicación (`nq_idem`) | `Nats-Msg-Id` = `nq_idem` al publicar **+** `nq_idem` en consumer | Broker = conveniencia; aplicación = muro de carga |
| Labels `nq_v`, `nq_task`, `nq_tenant`, `nq_idem`, `nq_trace`, `nq_enqueued_at`, `nq_priority` | **Intactos** (headers NATS) | El wire contract v1 sobrevive; bump a v1.1 documentando el binding NATS |

---

## 6. Plan de implementación por fases

> Numeración nueva **M0–M9** para no colisionar con las F del informe 3/3. Correspondencias indicadas. Cada fase tiene un **gate** — no se avanza sin cumplirlo.

### M0 — Suite de conformidad mínima *(era F7-mínimo; se adelanta)*

**Objetivo**: harness ejecutable que define "compliant" como estado verificado, parametrizado por transporte.

**Trabajo**:
- Round-trip productor TS (`@zetesis/nexus-queue`) → worker Python (`nexus_queue`) contra broker efímero en CI (Redis hoy; NATS después con el mismo harness).
- Asserts: naming `nq:{p}:{q}`; labels obligatorios presentes y bien formados; `NexusRetryableError` → backoff y reintento; `NexusPermanentError` → DLQ directo sin quemar presupuesto; agotamiento → DLQ con mensaje original + traceback + intentos + timestamp; doble publish con mismo `nq_idem` → un solo efecto; `/metrics` expone los nombres estándar.
- Integración en CI de PayloadAgents + proyectos adoptantes (ZP, nixon).

**Gate**: suite verde contra Redis en los tres CI. **Estimación**: 2–4 días.

### M1 — Spike NATS + prototipo contract-first — **EJECUTADA (2026-07-03)**

Banco reproducible en `backend/nexus-queue/spike-jetstream/` (`./run_all.sh`); veredicto completo en su `EVALUATION.md`. Resultados:

| Verificación | Resultado |
|---|---|
| NAK con delay → redelivery sin poller | **PASS** — redelivery a los 10.0s exactos, headers intactos |
| `backoff` declarativo del consumer | **PASS** — timeline [0s, 2s, 7s] clavado a la config |
| **Scale-to-zero: retry diferido visible para KEDA con flota a cero** | **PASS** — `num_ack_pending=1` visible toda la ventana NAK en `/jsz` con el worker desconectado; redelivery al reconectar. Corroborado en el código fuente de KEDA (lag = `num_pending + num_ack_pending`, ≥ v2.9) y de nats-server (`o.pending` es estado del servidor) |
| `max_deliver` agotado → advisory + mensaje completo recuperable para DLQ | **PASS** (aprendizaje: el mensaje agotado se vuelve **invisible** para KEDA — el listener de advisories no es opcional) |
| `in_progress()` para handlers largos | **PASS** — con heartbeat: 1 delivery; control sin él: redelivery espuria (riesgo real, mitigación válida) |
| Headers `nq_*` íntegros TS→Python + dedup `Nats-Msg-Id` | **PASS** |
| Contrato→codegen (E7) | **PASS** — 5 proyecciones coherentes (pydantic, zod, stream/consumer JSON, ScaledObject) de un contrato real |
| ¿Cabe NAK en taskiq? | **NO (confirmado)** — `AckableMessage={data, ack}`; labels sí viajan íntegros en el body |

**Gate resuelto**: ni (a) ni (b) ni (c)-como-broker-taskiq — la respuesta es **D14** (runtime v2 sin taskiq). Codegen: viable, proyecciones completas para el subset real. Formato: default confirmado (YAML propio exportable a AsyncAPI); revisar solo si Modelina/AsyncAPI CLI aportan más que su verbosidad.

**Pendiente heredado a M3** (no bloqueante para ratificar el plan): prototipo del receiver propio consumiendo un `HandlerSpec` real, y prueba e2e de KEDA con HPA en un cluster de verdad (el comportamiento del scaler está verificado en fuente + señal en vivo, pero no el ciclo HPA completo).

### M2 — Infra GitOps: JetStream en ambos clusters

**Trabajo**:
- Chart oficial de NATS vía GitOps (Mileto-Infra-GitOps para **cortes**; equivalente en el cluster de nixon). **1 réplica, file storage**, PVC inicial dimensionado (5–10 Gi), límites por defecto de streams.
- **NACK** (jetstream-controller) + CRDs `Stream`/`Consumer`.
- Métricas: exporter/endpoint nativo + ServiceMonitor; **endpoint de monitoring (8222) accesible** — lo consume el scaler de KEDA.
- ExternalSecret para credenciales (usuario de aplicación con permisos sobre `nq.>`; usuario ops read-only). NetworkPolicy: egress workers → NATS.
- **Sin accounts/leaf nodes** (D6): un account de aplicación basta hoy.

**Gate**: crear/borrar un Stream vía CRD sincronizado por ArgoCD; métricas visibles en Prometheus; `nats bench` básico OK.

### M3 — Runtime v2 sin taskiq (Python + TS) *(redefinida por D14)*

**Trabajo**:
- **`receiver.py` nuevo** (~300 líneas; los scripts E2/E3/E4/E6 del spike son el esqueleto): fetch loop con semáforo de concurrencia, dispatch por `HandlerSpec` (que ya existe y no cambia), clasificación de errores — `NexusRetryableError` → NAK (schedule = `backoff` declarativo del consumer, del contrato), `NexusPermanentError` → `TERM` + registro DLQ —, heartbeat `in_progress()` derivado del `processing_budget` del contrato, listener de advisories `MAX_DELIVERIES` → DLQ, y drain de SIGTERM (dejar de hacer fetch, terminar en vuelo, ack, salir).
- **Guardarraíl anti-framework**: el receiver es una librería fina cuya config viene del contrato (`consumer.json` generado); cero hooks genéricos — regla del dos.
- `handlers.py`: conserva su lógica (idempotencia, tracing, latencia) sin imports de taskiq — el around-scope que taskiq no daba ahora es el flujo natural del receiver.
- Publisher Python + kicker HTTP: `js.publish` directo del envelope v1 (body) + headers + `Nats-Msg-Id` = `nq_idem`. Validación de tamaño → claim-check `BlobStore` obligatorio (D12).
- Entrypoint propio (`asyncio.run`) — el "entrypoint estándar" que M6 ya pedía; muere el runner CLI de taskiq.
- **Mueren**: `delayed.py`, `RetryDlqMiddleware`, `broker.py`/`create_broker()` como seam de taskiq (el seam pasa a ser el receiver + el contrato).
- `naming.py`: mapping `nq:{p}:{q}` ↔ `nq.{p}.{q}` (+ `.dlq`, subject de status).
- Idempotencia: **intacta** (Redis sigue como idempotency store; el muro de carga no se toca — D4).
- Producer TS `@zetesis/nexus-queue`: cliente `nats.js` detrás de la **misma interfaz pública** (los exports del paquete no cambian).
- Spec bump a **v1.1**: binding NATS documentado; el wire contract v1 pasa a estar definido por nuestra spec (la forma sobrevive a taskiq).
- **Transición**: el lado Redis conserva taskiq tal cual hasta drenar (M5); taskiq sale de `pyproject.toml` al cierre.

**Gate**: suite M0 parametrizada verde contra **ambos** transportes en CI (lado Redis con el runtime actual, lado NATS con el v2).

### M4 — Piloto: dual-consume en una cola batch

**Trabajo**:
- Cola candidata: transcripción o reindexado (D10). **El contrato YAML se escribe primero**; CRDs generados (o escritos a mano si el codegen quedó parcial en M1).
- Productor con dual-publish tras feature flag → worker nuevo consume de NATS → drenar la cola Redis (patrón del estándar, generalización del script de migración existente) → cutover.
- Contabilidad del drain por `nq_idem`: enqueued vs processed, cero pérdidas.
- Observación 1–2 semanas: redeliveries, tamaño de DLQ, latencias, crecimiento de storage.

**Gate**: suite M0 verde contra NATS **en el pipeline real** + cero mensajes perdidos en el drain + sin incidencias operativas en el periodo de observación.

### M5 — Migración mecánica del resto de colas

**Trabajo**:
- Orden: batch primero, latencia-sensibles al final.
- Por cola: contrato YAML → CRDs → dual-consume → drain → cutover → **borrado de los recursos Redis** (streams, ZSETs, config de poller).
- Al cierre: Redis = solo cache + idempotency store; `delayed.py` y toda su operativa eliminados del repo; cero pollers en producción.

**Gate**: no queda ningún stream `nq:*` activo en Redis en ninguno de los dos proyectos.

### M6 — Chart genérico de worker *(era F4; nace NATS)*

**Trabajo** — todo el contenido del informe 3/3 con las correcciones de esta discusión:
- Deployment con entrypoint estándar y `WORKER_TASKS` en values; split por carga declarativo.
- **Probes según D3**: liveness = salud del proceso; conectividad al broker = métrica + alerta. Nada de probes que maten pods por un parpadeo del broker.
- Graceful drain: SIGTERM → dejar de hacer fetch, terminar lo en vuelo, ack, salir; `terminationGracePeriodSeconds` alineado con el `ack_wait` del perfil.
- Service + ServiceMonitor de serie; PDB por worker; NetworkPolicy con egress declarado en values; secrets por referencia (ExternalSecret).
- **Manifest del worker = referencia a los contratos de cola que sirve** — el values apunta a los `*.contract.yaml`; el chart deja de duplicar esa información.
- **Bloque scaler como sección swappable** (D5), aunque el único adapter implementado sea NATS.
- Patrón habitual: validar en ZP, portar a nixon.

**Gate / criterio falsable**: el siguiente worker nuevo se da de alta **sin escribir YAML de Kubernetes a mano** — solo values + contrato.

### M7 — KEDA sobre lag de JetStream *(era F5)*

**Trabajo**:
- Instalar KEDA por GitOps en ambos clusters. **Suelo de versión: ≥ 2.15.1, ideal ≥ 2.20** (en < 2.9 la claim central era literalmente falsa — issue #3787; 2.15.1 arregla leader-change en clúster; 2.20 convierte "consumer inexistente" en error en vez de escalar a max).
- Trigger `nats-jetstream` (consume el monitoring endpoint de M2; lag = `num_pending + num_ack_pending`, verificado en fuente). El endpoint **no tiene auth** → NetworkPolicy que restrinja :8222 al operator de KEDA.
- Defaults por perfil desde el contrato (`scaling.profile`): `lagThreshold`/`activationLagThreshold`, `cooldownPeriod` anti-flapeo.
- `minReplicas: 1` como default en latencia-sensibles (el cold start se paga en p99); **scale-to-zero opt-in explícito en el contrato**.
- **Matiz económico verificado**: con `activationLagThreshold: 0`, un retry en ventana de backoff mantiene 1 réplica idle (el lag es >0 durante todo el delay) — garantía mejor de lo prometido, ahorro menor. Subir el threshold recupera el ahorro pero reabre el riesgo para ese único mensaje: decisión por perfil, explícita en el contrato.
- El consumer durable debe **existir independientemente de los workers** (sin `InactiveThreshold` menor que la ventana a cero) — los CRDs de NACK (M2) lo dan por diseño.
- Alineación `ack_wait` / grace period / cooldown para que un scale-down no deje mensajes en limbo.
- Empezar por la cola batch piloto, medir, extender.

**Gate / criterio falsable**: la prueba de la grieta — **un retry diferido con la flota a cero se procesa sin intervención humana** (KEDA despierta al worker porque el lag del consumer lo ve). Esto era imposible sobre Redis sin parches. La señal está verificada en vivo (spike E3) y en el código fuente de KEDA/nats-server; este gate cierra el ciclo con el HPA real en cluster.

### M8 — Tooling de flota + observabilidad *(era F6)*

**Trabajo**:
- CLI `nq` contra NATS: `nq lag` (consumer info), `nq dlq ls/show/replay` (replay preservando `nq_idem` — seguro por diseño), `nq inspect <task_id>` (labels, trace, status), `nq drain <queue>`.
- Dashboard Grafana único parametrizado por `project`/`queue` — cada worker nuevo aparece solo.
- Alertas estándar: `dlq_size > 0`; lag creciente sostenido; consumer sin consumo con stream activo; ratio de retries anómalo. Más uso de PVC de JetStream.
- Tracing e2e ya propagado (`nq_trace`): del click en frontend al handler Python en un trace.
- **Accounts/leaf nodes solo si dispara su trigger**: el inspector cross-proyecto pasa a uso diario (D6).

### M9 — Conformidad completa en CI *(era F7 completo)*

**Trabajo**: suite completa (M0 + checklist extendido: métricas, drain, claim-check, contabilidad de idempotencia) obligatoria en el CI de PayloadAgents, ZP y nixon. La spec v1.1 declara: un proyecto es "compliant" **solo** si la suite corre verde en su CI.

---

## 7. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| ~~`taskiq-nats` inmaduro~~ **RESUELTO**: eliminado del diseño (D14) | — | El spike confirmó que ni parcheado servía (blocker en taskiq core). Sustituido por el riesgo siguiente. |
| **Receiver propio**: asumimos la propiedad de concurrencia, reconexión y drain | Bugs de runtime que antes "regalaba" el framework | Alcance acotado (~300 líneas); semánticas ya validadas en vivo (E2/E3/E4/E6, esqueleto reutilizable); suite M0 como red; guardarraíl anti-framework (config desde el contrato, cero hooks genéricos) |
| Pérdida de mensajes en cutover | Datos | Dual-consume + drain con contabilidad por `nq_idem` + suite M0 como aceptación; batch primero |
| Payload > 1 MB (límite NATS) | Publishes rechazados | Claim-check `BlobStore` obligatorio (D12); validación en publisher con error tipado |
| Handlers largos vs `ack_wait` (transcripción 20+ min) | Redeliveries espurias, efectos duplicados aparentes | `in_progress()` heartbeat en el runtime (patrón decidido en M1, no en producción); `ack_wait` por perfil en el contrato |
| Tormenta de restarts si NATS parpadea | Toda la flota | Probes según D3: la conectividad al broker no mata pods |
| Storage de JetStream se llena | Broker degradado | Límites por stream declarados en contrato + alerta de uso de PVC (M8) |
| Curva operacional NATS (`ack_wait`/`max_deliver`, retención, sizing) | Incidentes por desconocimiento | Empezar single-node sin HA (D6); runbook desde M2; el piloto M4 con periodo de observación es el campo de entrenamiento |
| Dual-write del productor (commit DB ok + enqueue fallido) | Jobs perdidos | Independiente del transporte: patrón `CREATED`-antes-de-enqueue + sweep de huérfanos formalizado en spec (D9) |
| El codegen contract-first no aguanta casos reales | Se cae la visión de elegancia | Degradación honesta: el contrato queda como documentación ejecutable + validación en CI aunque la generación sea parcial; se decide en M1, no tras meses |
| Drift entre proyectos durante la obra | Volver al punto de partida | M0 corre en los tres CI desde el día uno |

---

## 8. Criterios de éxito falsables

Heredados del informe 3/3:

1. El siguiente worker se da de alta **sin YAML de Kubernetes a mano** (values + contrato).
2. Quitar un worker = **borrar un values file**.
3. Un pico de cola se absorbe **sin intervención humana**.
4. Un mensaje muerto se diagnostica y reencola con el CLI **en minutos, en cualquier proyecto, con las mismas órdenes**.

Nuevos, propios de esta migración:

5. **Un retry diferido con la flota a cero se procesa solo** — la prueba directa de la grieta que motivó la migración. *(Señal verificada en el spike E3; pendiente el ciclo HPA completo en cluster. Matiz: la garantía es mejor de lo prometido, el ahorro menor — ver M7.)*
6. De un `*.contract.yaml` se generan tipos TS + pydantic + CRDs + ScaledObject **sin edición manual** (o, si M1 degradó la ambición: el contrato valida en CI y ninguna proyección diverge de él).
7. Suite de conformidad **verde contra NATS en el CI de los tres repos**.
8. `delayed.py` eliminado del repo; **cero pollers en producción**.
9. Redis en producción solo como cache + idempotency store; ningún stream `nq:*` activo.
10. **taskiq fuera del `pyproject.toml` de nexus-queue** al cierre de M5 (D14) — el runtime v2 no depende de ningún framework de tasks.

---

## 9. Guardarraíles — lo que NO haremos

- **No engordar el SDK** durante la migración (D11). Regla del dos: ningún puerto ni método nuevo sin un segundo consumidor real esperándolo.
- **No accounts/leaf nodes el día uno** (D6). La federación tiene su propio trigger.
- **No HA/RAFT de 3 nodos** sin un SLA que lo pida.
- **No colas compartidas entre proyectos** — nunca. Interop de operaciones sí; si un proyecto necesita invocar trabajo en otro: kicker HTTP con HMAC en el borde (y, post-migración, import/export de subjects como opción futura).
- **No construir F4–F6 sobre Redis en paralelo** "por si acaso" — no pagar las dos facturas.
- **No relajar la idempotencia de handlers** porque el broker tenga dedup (D4).
- **No reconstruir un framework de tasks** (D14) — el receiver es una librería fina cuya config viene del contrato; si le crecen hooks genéricos o abstracciones "por si acaso", regla del dos.
- **No desmantelar Redis** — cambia de papel, no desaparece.
- **No mover handlers entre proyectos preventivamente** — movilidad oportunista: cuando la duplicación duela de verdad.

---

## 10. Alternativas descartadas y triggers de revisita

Se mantienen las conclusiones del informe 2/3, actualizadas tras la decisión:

| Alternativa | Estado | Trigger de revisita |
|---|---|---|
| **Temporal** | Descartado — cambia la *forma* del trabajo, no el volumen; reemplazaría el runtime entero | El día que implementemos a mano "reanudar en etapa 3 tras aprobación humana con timeout de 72 h": parar y evaluar Temporal antes de escribir una línea |
| **Postgres como cola** (pgmq/river) | Descartado — era la opción "la flota no se materializa"; la decisión de flota lo desactiva | Solo si en un año la visión de flota se abandona formalmente |
| **Kafka / Redpanda** | Descartado sin dudas | Pivote del producto a event streaming (retención/replay como features de negocio, múltiples lectores del mismo log) |
| **RabbitMQ** | Descartado explícitamente | Ninguno — "el punto medio aburrido": sin dimensión donde domine. Si se paga una migración, que compre la frontera |
| **CloudEvents como envelope** | No adoptado; mapping labels↔CloudEvents documentado | Aparición de un consumidor externo real que lo exija (bridge mecánico) |

---

## Apéndice: correspondencia con la numeración original

| Informe 3/3 | Este plan | Cambio |
|---|---|---|
| F4 (chart genérico) | M6 | Pospuesto tras la migración; probes corregidos; manifest = contrato; scaler swappable |
| F5 (KEDA) | M7 | Trigger `nats-jetstream` en vez de `redis-streams`; scale-to-zero sin parches |
| F6 (CLI + observabilidad) | M8 | Contra NATS; federación con trigger propio |
| F7 (conformidad) | **M0** (mínima) + M9 (completa) | **Adelantada a primera posición** — guardián + test de aceptación |
| — | M1–M5 | Nuevas: spike, infra, runtime, piloto, migración |
