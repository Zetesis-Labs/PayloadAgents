# Nexus-Queue — Especificación del estándar

> **Versión**: v0.1 · **Fecha**: 2026-06-17 (versionada en repo el 2026-07-03) · **Estado**: vigente — adoptada en ZP y nixon (PR #240)
> **Proyectos de referencia**: `ZetesisPortal` (ZP) · `konect-nixon` (`irontec-comms/konect-nixon`)
> **Casa**: `@zetesis/nexus-queue` (npm, cliente TS) + `nexus-queue` (PyPI, runtime Python) — ambos en `PayloadAgents/`
> **Evolución prevista (v1.1)**: migración del transporte a NATS JetStream + runtime v2 sin taskiq + modelo contract-first — plan y decisiones (D1–D14) en [`docs/architecture/nexus-queue-jetstream-migration.md`](../../docs/architecture/nexus-queue-jetstream-migration.md)

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

- **Base fija**: taskiq + `taskiq_redis.RedisStreamBroker` (Redis Streams, consumer groups, `XACK`, `XAUTOCLAIM`). At-least-once.
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
- Broker: `RedisStreamBroker(url, queue_name=<stream>, consumer_group_name=<group>)`.
- Un mensaje = entrada de Redis Stream `XADD <stream> * data <json>`, donde `data` es el `TaskiqMessage` serializado por el `JSONFormatter` de taskiq (compatibilidad garantizada con el productor TS, que replica este formato).

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

```python
async def parse_to_text(
    p: ParsePayload,
    state: JobStatePort = NexusDepends(JobStatePort),
    blobs: BlobStorePort = NexusDepends(BlobStorePort),
    index: IndexPort     = NexusDepends(IndexPort),
) -> None:
    await state.processing(p.job_id)
    text = await extract(await blobs.get(p.blob_ref))
    await index.upsert("documents", [{"id": p.job_id, "text": text, "tenant": p.tenant}])
    await state.complete(p.job_id, result={"chars": len(text)})
```

Reglas:
- **Solo** depende de puertos + su payload model. **Nunca** importa el dominio de un proyecto.
- **Idempotente**: re-ejecución (redelivery) no duplica efectos. Guard recomendado: `if await state.get(job_id) == COMPLETED: return`.
- **Errores**: lanza `NexusRetryableError` (transitorio → reintento) o `NexusPermanentError` (no reintentable → DLQ directo + `fail(permanent=True)`). Cualquier otra excepción se trata como retryable hasta agotar reintentos → DLQ.

### Composición por proyecto (la prueba de movilidad)
```python
# ZP                                         # nixon
b = create_broker("nq:zp:documents")         b = create_broker("nq:nixon:jobs")
register_lifecycle(b, ZetesisAdapters(...))  register_lifecycle(b, NixonAdapters(...))
register(b, parse_to_text)                   register(b, parse_to_text)   # ← handler idéntico
```

---

## 7. Middleware stack estándar

Lo aporta `create_broker()`; el handler no lo configura. Orden (outer→inner):

1. **TracingMiddleware** — extrae `nq_trace`, abre span de *consume* enlazado al de *produce*. OTel.
2. **MetricsMiddleware** — counters (recibidos/ok/fallidos/reintentos), histograma de latencia, gauge de profundidad (`XLEN`). Prometheus.
3. **IdempotencyMiddleware** — `SETNX nq:idem:{nq_idem}` con TTL; si ya existe → ack y skip.
4. **SmartRetryMiddleware** — **defaults sanos del estándar**: `max_retries=3`, backoff **exponencial + jitter** (sustituye el delay fijo de 30 s y los marcadores de string de nixon por errores tipados retryable/permanent).
5. **DlqMiddleware** — al agotar reintentos (o `NexusPermanent`): `XADD nq:{project}:{queue}:dlq` con `{ original_message, error, traceback, attempts, failed_at }` en vez de drop silencioso. Emite `fail(permanent=True)`.

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
Escribe un `TaskiqMessage` compatible directo al stream namespaced (`XADD`), o habla con el kicker estándar. Estampa los mismos labels + `traceparent` (traza e2e desde Node hasta el worker Python). **Reemplaza el kicker hecho a mano de ZP.**

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

- **Un worker** = runtime + adapters + handlers registrados. Imagen única, entrypoint = el broker module.
- **Split por carga**: `WORKER_TASKS` (idiom de nixon, estándar) — registro selectivo de tasks por env; en Helm, un Deployment por variante.
- **Autoescalado**: KEDA `ScaledObject` sobre **lag/pending del stream** (señal real), no CPU. (Hoy: ZP HPA-CPU apagado, nixon nada.)
- **Resiliencia**: PDB por worker; **readiness = conectividad al broker** (hoy ningún worker tiene readiness real); graceful drain (dejar de consumir + terminar en vuelo en SIGTERM).

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
1. Usa streams `nq:{project}:*` (nunca el default `"taskiq"`).
2. Estampa todos los labels obligatorios (§4.3) y payload tipado.
3. Sus handlers solo dependen de puertos (no del dominio de otro proyecto).
4. Sus handlers son idempotentes.
5. Pasa el **round-trip** TS-productor → Python-worker (test de conformidad).
6. Tiene retry+DLQ activos (no drop) y emite status events.
7. Expone métricas + readiness de broker.

La suite de conformidad (pytest + vitest) se cablea a ambos CIs.

---

## 15. Migración de ZP y nixon

**nixon** (ya hexagonal — el trabajo es *promover*):
- Sacar `EventBusPort`/`UnitOfWorkPort`/`StorageServicePort`/`PublisherPort` de `nixon_server_core` → implementar los puertos de `nexus-queue`.
- `nixon-worker-core` pasa a depender de `nexus-queue` (broker factory, lifecycle, middleware) en vez de definirlos.
- ~~Fix: subir `queue_max_attempts`~~ **CORRECCIÓN (verificado en origin/main 2026-07-02)**: `queue_max_attempts` default=3 ⇒ los reintentos de nixon SÍ funcionan, y ya distingue no-retryables (por string-markers). Lo que aporta el estándar aquí: errores tipados, backoff exponencial+jitter y DLQ al agotar.

**ZP** (el trabajo es *refactor a puertos*):
- Refactor de `parse_document` para hablar con `JobStatePort`/`BlobStorePort`/`IndexPort` en vez de `PayloadClient`/`LlamaParseClient` directos.
- Mapear `JobStatePort` → campos `parse_*` del doc.
- `payload-documents-worker-builder` depende de `nexus-queue`.
- **Fix**: el `payload_service_token` que `main.py:20` pasa a un `RuntimeConfig` que ya no lo declara (rompería en boot).

**Ambos**: renombrar streams a `nq:{project}:documents|jobs` (anti-colisión) — **cambio coordinado** (drenar la cola vieja antes de cortar).

---

## 16. Layout del paquete y release

```
PayloadAgents/
  packages/nexus-queue/   → npm  @zetesis/nexus-queue   (cliente TS + tipos del envelope + helpers de test)
  backend/nexus-queue/    → PyPI nexus-queue            (runtime, puertos, middleware, kicker, PipelineRouter)
```
- Release-please (scopes nuevos `nexus-queue` TS + `nexus-queue` Python). Contenido **agnóstico de Zetesis** pese al scope `@zetesis/`; Konect lo consume desde npm/PyPI (ya consume `@zetesis/*`).

---

## 17. Decisiones abiertas

1. **Stream por queue vs por task** por defecto — propuesto: por queue, con opt-in a por-task para etapas que escalan aparte. ¿OK?
2. **Resultados grandes** (p.ej. `parsed_text`) — ¿inline en `result` del status event, o `result_ref` vía `BlobStorePort`? Propuesto: `result_ref` si supera N KB.
3. **Interop runtime real** (¿Redis compartido entre proyectos, o solo formato común?) — propuesto: formato común + Redis por proyecto; interop "física" solo para el DLQ-inspector central (lee read-only los `nq:*:dlq`).
4. **`nq_idem` determinista** — ¿lo genera el productor siempre, o el runtime cae a `task_id` si falta? Propuesto: productor siempre; runtime avisa (warn) si falta.

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
