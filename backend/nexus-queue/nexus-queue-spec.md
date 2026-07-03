# Nexus-Queue — Especificación del estándar

> **Versión**: v1.1 · **Fecha**: 2026-07-03 (v0.1: 2026-06-17) · **Estado**: vigente — v0.1 adoptada en ZP y nixon (PR #240); v1.1 añade el **binding NATS JetStream** (runtime v2 sin taskiq, decisión D14) con el wire contract v1 **intacto**
> **Proyectos de referencia**: `ZetesisPortal` (ZP) · `konect-nixon` (`irontec-comms/konect-nixon`)
> **Casa**: `@zetesis/nexus-queue` (npm, cliente TS) + `nexus-queue` (PyPI, runtime Python) — ambos en `PayloadAgents/`
> **Plan de migración y decisiones (D1–D14)**: [`docs/architecture/nexus-queue-jetstream-migration.md`](../../docs/architecture/nexus-queue-jetstream-migration.md)

---

## 1. Propósito y alcance

Nexus-Queue es el estándar de colas asíncronas para el ecosistema. Dos objetivos, en este orden:

1. **Workers movibles entre proyectos** — poder coger el código de un worker (su lógica) y desplegarlo en otro proyecto sin reescribirlo. Se logra con **ports-and-adapters**: el handler no conoce ni el almacén de estado ni la infra del proyecto; habla con **puertos** que cada proyecto implementa.
2. **Interop de mensajes** — un mensaje encolado por un proyecto es deserializable/consumible por otro (DLQ-inspector central, mover workers entre clusters, colas compartidas). Cae de propina del **wire contract** versionado.

### No-objetivos (v1)
- No reemplaza taskiq ni Redis Streams: el estándar **formaliza y endurece** lo que ZP y nixon ya usan, no rediseña el transporte.
- No fuerza movilidad de handlers de **dominio puro** (p.ej. "analizar llamada" no tiene sentido en un portal de libros). La movilidad que paga es: el **runtime** (100%), los **handlers transversales** (file-to-text, indexación, embeddings, categorización — ZP y nixon ya los duplican) y la **interop de ops**.
- No cubre, por ahora, runtimes fuera de **Python (workers)** + **TypeScript (productores)**.

---

## 2. Principios de diseño

- **Transporte dual, wire único**: v1 = taskiq + `taskiq_redis.RedisStreamBroker` (Redis Streams, consumer groups, `XACK`, `XAUTOCLAIM`); v2 = **NATS JetStream con runtime propio sin taskiq** (`NatsWorker`/`NatsReceiver`/`NatsPublisher`, D14). At-least-once en ambos; mismo envelope, mismos labels, misma semántica de retry/DLQ — la suite de conformidad corre idéntica contra los dos. Redis permanece como **idempotency store** en ambos (D4).
- **Agnóstico de dominio**: el paquete `nexus-queue` no importa nada de ZP ni de nixon. Los proyectos dependen de él, nunca al revés.
- **Ports-and-adapters**: handler → puertos → adapters (por proyecto). El handler es una función sobre puertos + un payload tipado.
- **Políglota por el wire**: el productor puede ser Python (`Publisher`) o TS (`@zetesis/nexus-queue`); ambos emiten el **mismo** `TaskiqMessage` al **mismo** stream namespaced. El worker (Python) no distingue quién encoló.
- **Config fuera de la librería**: la librería recibe un `RuntimeConfig`/adapters; no lee `env` por dentro (permite multi-tenant y testeo).
- **Idempotencia obligatoria**: todo handler debe poder re-ejecutarse sin efectos duplicados; el runtime ayuda con dedup por clave.

---

## 3. Arquitectura (3 capas + wire)

```
┌──────────────────────────────────────────────────────────────┐
│  HANDLERS (movibles)   parse_to_text · index · embed · ...      │
├──────────────────────────────────────────────────────────────┤
│  PUERTOS   JobStatePort · BlobStorePort · IndexPort · StatusEventPort │
├──────────────────────────────────────────────────────────────┤
│  RUNTIME  nexus-queue:  broker namespaced · middleware stack    │
│           (tracing·métricas·idempotencia·retry·DLQ) · lifecycle │
│           · WORKER_TASKS · Publisher · kicker genérico          │
└──────────────────────────────────────────────────────────────┘
   adapters por proyecto ─┐
   ZP    → PayloadJobState · PayloadMedia · TypesenseIndex
   nixon → PostgresJobState · MinioStore · TypesenseIndex
```

El **wire contract** (§4) es ortogonal: viaja en los labels de cada mensaje y habilita tracing e2e, dedup, DLQ e interop.

---

## 4. Wire contract v1

### 4.1 Transporte y serialización
- **Binding Redis (v1)**: `RedisStreamBroker(url, queue_name=<stream>, consumer_group_name=<group>)`. Un mensaje = entrada de Redis Stream `XADD <stream> * data <json>`.
- **Binding NATS (v2)**: publish JetStream al subject `nq.{project}.{queue}` con el **mismo JSON** en el cuerpo, más header `Nats-Msg-Id` = `nq_idem` para dedup publish-side del broker (ventana corta; la idempotencia de aplicación sigue siendo el muro de carga).
- El JSON del envelope (`task_id`, `task_name`, `labels`, `args`, `kwargs`) **lo define esta spec**, no taskiq — nació con la forma de `TaskiqMessage` y le sobrevive. Productores TS y Python emiten la misma forma en ambos transportes.

### 4.2 Naming de streams (resuelve la colisión actual)
Hoy ZP y nixon usan ambos el default `"taskiq"` → colisionan. El estándar **prohíbe el default** y exige:

| Recurso | Patrón | Ejemplo |
|---|---|---|
| Stream de trabajo | `nq:{project}:{queue}` | `nq:zp:documents`, `nq:nixon:jobs` |
| Consumer group | `nq:{project}:{queue}:cg` | `nq:nixon:jobs:cg` |
| Dead-letter | `nq:{project}:{queue}:dlq` | `nq:zp:documents:dlq` |
| Status events | `nq:{project}:status` | `nq:nixon:status` |

- `project` = slug corto y estable del proyecto (`zp`, `nixon`).
- `queue` = dominio/pipeline lógico (`documents`, `jobs`). Por defecto **un stream por queue** (las etapas de un pipeline lo comparten y se reparten por registro/`WORKER_TASKS`). Una etapa cara que deba escalar/aislarse **puede** tener su propio `queue` (p.ej. `nq:nixon:transcription`).

**Binding NATS (v2)** — mapeo mecánico de los mismos nombres:

| Recurso | Patrón | Ejemplo |
|---|---|---|
| Subject de trabajo | `nq.{project}.{queue}` | `nq.zp.documents` |
| Stream JetStream | `NQ_{PROJECT}_{QUEUE}` (retention `limits`) | `NQ_ZP_DOCUMENTS` |
| Subject DLQ | `nq.{project}.{queue}.dlq` | `nq.zp.documents.dlq` |
| Stream DLQ | `NQ_{PROJECT}_{QUEUE}_DLQ` | `NQ_ZP_DOCUMENTS_DLQ` |
| Durable consumer | `nq_{project}_{queue}_cg` | `nq_zp_documents_cg` |

> Retention del stream de trabajo = `limits`, no `workqueue`: el listener de agotamiento debe poder recuperar el mensaje por sequence, y `workqueue` además limita el subject a un solo consumer.

### 4.3 Labels obligatorios y opcionales
Los labels viajan en `TaskiqMessage.labels`. El `task_name` de taskiq **es** `nq_task` (registro y wire coinciden).

| Label | Req | Tipo | Semántica |
|---|---|---|---|
| `nq_v` | ✅ | str | versión del contrato (`"1"`). Gate de compatibilidad. |
| `nq_task` | ✅ | str | nombre lógico namespaced `{project}.{domain}.{action}` (= `task_name`). Ej. `zp.documents.parse`, `nixon.jobs.transcription`. |
| `nq_tenant` | ✅ | str | id de tenant; `"_"` si single-tenant. **Multi-tenancy va en el label, no en streams por tenant.** |
| `nq_idem` | ✅ | str | idempotency key determinista (p.ej. hash de la operación). Dedup en el runtime. |
| `nq_enqueued_at` | ✅ | str | ISO-8601 UTC. |
| `nq_trace` | ⭐ | str | W3C `traceparent` (`00-<traceid>-<spanid>-01`). Recomendado siempre → traza e2e. |
| `nq_priority` | ⬜ | str | `default` \| `high`. |

> `args`/`kwargs` del `TaskiqMessage` transportan el **payload tipado** (pydantic), no el contexto de routing — ese va en labels. Prohibido el envelope "id pelado" actual (`args=["<id>"]`) sin más.

### 4.4 Payload tipado
Cada task declara un modelo pydantic. El payload viaja **con el handler** (en su paquete), no en el dominio del proyecto:

```python
class ParsePayload(BaseModel):
    job_id: str
    blob_ref: str          # referencia opaca resoluble por BlobStorePort
    tenant: str
```

---

## 5. Puertos (el contrato de movilidad)

Interfaces `Protocol` en `nexus_queue.ports`. Un proyecto es "compliant" si provee adapters para los que use.

```python
class JobStatus(str, Enum):
    CREATED = "created"; PROCESSING = "processing"
    COMPLETED = "completed"; FAILED = "failed"

class JobStatePort(Protocol):
    """El productor crea el job ANTES de encolar; el handler transiciona estado."""
    async def processing(self, job_id: str, *, meta: Mapping[str, Any] | None = None) -> None: ...
    async def complete(self, job_id: str, *, result: Mapping[str, Any]) -> None: ...
    async def fail(self, job_id: str, *, error: str, permanent: bool) -> None: ...
    async def get(self, job_id: str) -> JobStatus: ...

class BlobStorePort(Protocol):
    async def get(self, ref: str) -> bytes: ...
    async def put(self, ref: str, data: bytes, *, content_type: str) -> str: ...

class IndexPort(Protocol):
    async def upsert(self, collection: str, docs: Sequence[Mapping[str, Any]]) -> None: ...
    async def delete(self, collection: str, ids: Sequence[str]) -> None: ...

class StatusEventPort(Protocol):
    async def emit(self, event: "StatusEvent") -> None: ...
```

### Mapeo a los proyectos

| Puerto | ZP (adapter) | nixon (adapter) |
|---|---|---|
| `JobStatePort` | PATCH a campos `parse_*` del doc Payload | state machine DDD en Postgres (`JobLifecycleMixin`) |
| `BlobStorePort` | media de Payload / S3 | MinIO (`MinIOStorageService`) |
| `IndexPort` | `@zetesis/payload-typesense` | `nixon-search-typesense` |
| `StatusEventPort` | `XADD nq:zp:status` | generaliza `nixon:domain_events` → `XADD nq:nixon:status` |

> Los estados extra de nixon (`EXPIRED`) son detalle del adapter, no del puerto. El puerto define el **mínimo común**.

---

## 6. Contrato de handler

Un handler es `async def h(payload, deps) -> None`: su payload tipado más el
contenedor de adapters del proyecto, tipado como un `Protocol` de los puertos
que realmente usa. Se registra con `HandlerSpec` (API shippeada — el estilo
`NexusDepends` de la v0.1 draft nunca llegó a implementarse):

```python
class DocumentPorts(Protocol):
    state: JobStatePort
    blobs: BlobStorePort
    index: IndexPort

async def parse_to_text(p: ParsePayload, deps: DocumentPorts) -> None:
    await deps.state.processing(p.job_id)
    text = await extract(await deps.blobs.get(p.blob_ref))
    await deps.index.upsert("documents", [{"id": p.job_id, "text": text, "tenant": p.tenant}])
    await deps.state.complete(p.job_id, result={"chars": len(text)})

specs = [HandlerSpec("zp.documents.parse", parse_to_text, ParsePayload)]
```

Reglas:
- **Solo** depende de puertos + su payload model. **Nunca** importa el dominio de un proyecto.
- **Idempotente**: re-ejecución (redelivery) no duplica efectos. Guard recomendado: `if await state.get(job_id) == COMPLETED: return`.
- **Errores**: lanza `NexusRetryableError` (transitorio → reintento) o `NexusPermanentError` (no reintentable → DLQ directo + `fail(permanent=True)`). Cualquier otra excepción se trata como retryable hasta agotar reintentos → DLQ.

### Composición por proyecto (la prueba de movilidad)
```python
# ZP (transporte v1, taskiq)                 # nixon (transporte v2, JetStream)
app, broker = create_worker(                 await run_nats_worker(
    zp_config, ZetesisAdapters(...), specs       nixon_config, NixonAdapters(...), specs
)                                            )
# ← mismos specs, mismo handler; cambia el config y los adapters
```

---

## 7. Semántica estándar de consumo

El handler nunca la configura; la aporta el runtime. Las garantías son idénticas
en ambos transportes — cambia dónde viven:

**Comunes**: gate de versión (`nq_v`), dedup por `nq_idem` con claim-up-front y
release en fallo (Redis como store, TTL configurable), span OTel de *consume*
enlazado al de *produce* vía `nq_trace`, contadores Prometheus estándar,
backoff **exponencial + jitter** con `max_retries` del config, errores tipados
`NexusRetryableError`/`NexusPermanentError` (permanente → DLQ directo sin
quemar presupuesto), y DLQ con `{ envelope, error, permanent, attempts,
failed_at }` en vez de drop silencioso.

**Binding Redis (v1)** — middleware de taskiq sobre `create_broker()`:
`MetricsMiddleware` + `RetryDlqMiddleware` (retry = re-publish diferido vía
sorted-set `nq:*:delayed` + `DelayedRetryPoller` in-worker) + los cross-cutting
del wrapper de `register`.

**Binding NATS (v2)** — pasos explícitos de `NatsReceiver` (sin middleware):
- retry transitorio = **`NAK(delay)`** con el schedule derivado del config.
  *Gotcha verificado en conformidad*: un NAK explícito **ignora** el `backoff`
  declarativo del consumer — el delay debe viajar en el NAK. El `backoff`
  declarativo (`max_deliver`, `backoff[]`) queda como red para workers muertos
  (redelivery por `ack_wait`).
- permanente = **`TERM`** + registro DLQ.
- agotamiento de `max_deliver` = advisory **`MAX_DELIVERIES`** → listener → DLQ.
  Obligatorio: el mensaje agotado es invisible para el worker **y** para la
  señal de lag de KEDA.
- handlers largos = heartbeat **`in_progress()`** (evita redeliveries espurias
  por `ack_wait`).

---

## 8. Productores (políglota)

### 8.1 Python
```python
publisher.enqueue(
    "nixon.jobs.transcription",
    TranscriptionPayload(job_id=..., blob_ref=..., tenant=...),
    idempotency_key=..., priority="default",
)   # estampa labels + traceparent, XADD al stream namespaced
```

### 8.2 TypeScript — `@zetesis/nexus-queue`
Cliente HTTP del kicker estándar (`POST /enqueue/{task}` + `X-Nexus-Secret`):
el envelope lo estampa el kicker server-side, así que el productor TS pone en
el wire exactamente la misma forma que el Python — en cualquier transporte —
y propaga `traceparent` (traza e2e desde Node hasta el worker). **Reemplazó el
kicker hecho a mano de ZP.** (El acceso directo al broker desde TS de la v0.1
draft no se implementó: un solo camino de escritura es un solo sitio donde
validar.)

### 8.3 Kicker estándar (para productores que no llegan a Redis)
```
POST /enqueue/{task}
X-Nexus-Secret: <hmac>            # o mTLS
{ "payload": {...}, "tenant": "...", "idempotency_key": "...",
  "priority": "default", "trace": "00-..." }
→ 202 { "status": "queued", "task": "<task>", "task_id": "<id>" }
GET /health · GET /ready          # ready = conectividad al broker
```

---

## 9. Estado, resultado y eventos

- **Sin `result_backend` de taskiq** (coherente con ambos hoy). El resultado vive en el system-of-record del proyecto vía `JobStatePort`.
- **Status events** al stream `nq:{project}:status` (esquema versionado) — generaliza el `nixon:domain_events` y da a ZP **push-status** (mata el polling de 3s):
```json
{ "nq_v":"1", "job_id":"…", "task":"zp.documents.parse", "tenant":"…",
  "state":"completed", "ts":"…", "trace":"00-…", "error":null }
```
- **Patrón de consumo** (opcional, shippeado una vez): un *SSE bridge* que lee el status stream y empuja a los clientes.

---

## 10. Semántica de entrega y pipelines

- **At-least-once**: `XACK` tras completar; crash → `XAUTOCLAIM` re-entrega pasado `idle_timeout`. Por eso la idempotencia es **obligatoria** (§6).
- **Pipelines**: el encadenado etapa→etapa lo hace un `PipelineRouter` (estándar, portado del de nixon) que reencola la siguiente task con el mismo `job_id` + labels propagados (incl. `nq_trace`).
- **Compensación (saga)**: opcional. El estándar recomienda que cada etapa sea idempotente y que los fallos de etapa N>1 dejen el job en `FAILED` con `meta.stage`, reanudables desde la última etapa COMPLETED.

---

## 11. Despliegue y ops

- **Un worker** = runtime + adapters + handlers registrados. Imagen única. Entrypoint: v1 = broker module (taskiq CLI) + uvicorn; v2 = **`run_nats_worker()`** — proceso único con receiver + kicker/probes/métricas HTTP.
- **Split por carga**: `WORKER_TASKS` (idiom de nixon, estándar) — registro selectivo de tasks por env; en Helm, un Deployment por variante.
- **Autoescalado**: KEDA `ScaledObject` sobre el **lag del consumer** (señal real), no CPU. En NATS: trigger `nats-jetstream` (lag = `num_pending + num_ack_pending` vía monitoring endpoint), **KEDA ≥ 2.15.1** (ideal ≥ 2.20); el consumer durable debe existir independientemente de los workers (CRDs). El endpoint de monitoring no tiene auth → NetworkPolicy.
- **Resiliencia**: PDB por worker; **probes (D3)**: liveness = salud del proceso; la conectividad al broker es **métrica + alerta, nunca un probe que mate pods** (un parpadeo del broker sincronizaría restarts de toda la flota). Graceful drain: SIGTERM → dejar de consumir + terminar lo en vuelo + ack + salir; `terminationGracePeriodSeconds` debe cubrir el handler más lento.

---

## 12. Observabilidad

- **Tracing e2e**: span produce → span consume vía `nq_trace`. (Hoy: ninguno lo tiene.)
- **Métricas**: profundidad, latencia por etapa, reintentos, tamaño de DLQ → Prometheus + dashboard Grafana + alertas (`dlq_size>0`, lag alto, consumer parado).
- **Logs**: structlog JSON con `job_id`/`tenant`/`trace` bindeados (ambos ya lo hacen; se estandariza el set de campos).

---

## 13. Versionado y evolución

- `nq_v` gate: un worker rechaza (→ DLQ) lo que no sabe interpretar.
- Cambios compatibles (añadir label opcional, campo opcional al payload) → no suben `nq_v`.
- Cambios incompatibles → `nq_v` nuevo + ventana de doble-consumo.

---

## 14. Conformidad ("Nexus-Queue compliant")

Un proyecto cumple si:
1. Usa los nombres namespaced del §4.2 (nunca el default del transporte).
2. Estampa todos los labels obligatorios (§4.3) y payload tipado.
3. Sus handlers solo dependen de puertos (no del dominio de otro proyecto).
4. Sus handlers son idempotentes.
5. Pasa el **round-trip** TS-productor → Python-worker (test de conformidad).
6. Tiene retry+DLQ activos (no drop) y emite status events.
7. Expone las métricas estándar y probes según D3 (liveness = proceso).

**La suite existe**: `backend/nexus-queue/tests/conformance/` — pytest
parametrizado por transporte (`TRANSPORTS = [redis, nats]`) contra brokers
reales, con el round-trip cross-language conduciendo el **dist real** del
cliente TS a través del kicker. Corre en el CI de este repo (job
`nexus-queue-conformance`); los proyectos adoptantes la cablean al suyo.

---

## 15. Adopción y migración

**Histórico (v0.1, completado)**: nixon promovió su hexagonal a los puertos del
estándar (PR #240) y ZP refactorizó su documents-worker a puertos; los streams
se renombraron al naming anti-colisión con drenado coordinado.

**Migración de transporte (v1 → v2)**: sigue el plan M0–M9 del doc de
migración. Por cola: contrato → topología declarada (CRDs) → dual-consume →
drenar → cutover, con la suite de conformidad como test de aceptación. El lado
Redis conserva taskiq hasta drenar; al cierre, taskiq sale de las dependencias
del runtime (criterio de éxito #10).

---

## 16. Layout del paquete y release

```
PayloadAgents/
  packages/nexus-queue/   → npm  @zetesis/nexus-queue   (cliente TS + tipos del envelope + helpers de test)
  backend/nexus-queue/    → PyPI nexus-queue            (runtime, puertos, middleware, kicker, PipelineRouter)
```
- Release-please (scopes nuevos `nexus-queue` TS + `nexus-queue` Python). Contenido **agnóstico de Zetesis** pese al scope `@zetesis/`; Konect lo consume desde npm/PyPI (ya consume `@zetesis/*`).

---

## 17. Decisiones (resueltas en v1.1)

1. **Stream por queue** ✅ — con opt-in a por-task para etapas que escalan
   aparte. En NATS el opt-in se abarata: la jerarquía de subjects permite un
   consumer filtrado sin crear streams nuevos.
2. **Resultados grandes** ✅ — `result_ref` vía `BlobStorePort` (claim-check).
   En NATS es además **obligatorio** por encima del límite de payload del
   broker (1 MB por defecto): el publisher valida y rechaza con error tipado (D12).
3. **Interop** ✅ — formato común + broker por proyecto; nunca colas
   compartidas. Interop de *operaciones*: el DLQ-inspector lee los DLQ de cada
   proyecto en read-only. En NATS, accounts/leaf nodes quedan como opción
   futura con trigger propio (inspector cross-proyecto como uso diario).
4. **`nq_idem`** ✅ — lo genera el productor siempre; sin él, el publisher v2
   usa `task_id` como `Nats-Msg-Id` (sin dedup runtime) y el handler pierde la
   garantía de dedup — la suite lo trata como no conformante para tasks
   idempotentes.

---

### Primer hito sugerido (F1)
Extraer el **runtime** + **puertos** a `nexus-queue`, repuntar nixon (promover) y ZP (refactor) **en worktree para nixon** (está ocupado), arreglar los 2 bugs, y validar con **un handler movible** (candidato: file-to-text/parse o indexación Typesense — ambos lo quieren).

---

## Apéndice A — Control-plane / notify events (vs work-queue)

Nexus-Queue es una **work-queue**: comandos durables, **un** consumer por mensaje (consumer groups), retry/DLQ. Hay un problema vecino que **no** es eso y que NO debe meterse en la cola: la **señalización de control-plane** ("recárgate la config"), que es **broadcast a todas las réplicas**, fire-and-forget.

**Caso real (ZP).** `pg_notify('agent_reload', slug)` y `pg_notify('channel_reload', label)` se emiten desde hooks `afterChange/afterDelete` de Payload (vía el handle drizzle) y todas las réplicas del agent-runtime escuchan (`LISTEN`) + resync periódico de 5 min. Es **transaccional** (ligado al commit de Postgres), **fan-out** y de **infra-cero**.

**Regla del estándar:** no migrar esto a la work-queue. Con Redis Streams + consumer groups solo **una** réplica recibiría el reload (roto); además introduce el *dual-write problem* que pg_notify evita por diseño.

**Guía de elección:**
- **`pg_notify`** cuando el emisor tiene Postgres y necesita **atomicidad transaccional** con el commit (caso ZP: reload-on-change). Preferente.
- **Redis pub/sub** (o el status-stream `nq:{project}:status` leído por todos) cuando el emisor **no** tiene PG, o el consumidor es cross-stack, o ya estás en Redis.

**`NotifyPort` (opcional).** Para unificar la *API* aunque el transporte difiera, el paquete puede exponer:
```python
class NotifyPort(Protocol):
    async def notify(self, channel: str, payload: str) -> None: ...
    def listen(self, channel: str) -> AsyncIterator[str]: ...
```
con dos adapters: `PgNotifyAdapter` (LISTEN/NOTIFY) y `RedisNotifyAdapter` (pub/sub). **No** sustituye el `pg_notify` existente — lo formaliza para que nuevos casos no lo reinventen ad-hoc. Es work-queue **y** notify bajo el mismo estándar, cada uno con su primitiva correcta.
