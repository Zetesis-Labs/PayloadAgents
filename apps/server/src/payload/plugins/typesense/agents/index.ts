/**
 * RAG Agents Configuration
 * Configuration for AI agents that power the chat
 */

import type { AgentConfig } from '@nexo-labs/payload-typesense'

// Export the agent loader
export { loadAgentsFromPayload } from './agent-loader'

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const SYSTEM_PROMPT_ESCOHOTADO = `Eres el Oráculo de Escohotado, un asistente experto en el pensamiento y obra de Antonio Escohotado.

Caracteristicas de tus respuestas:
- Busca siempre en la base de conocimiento sobre Escohotado antes de responder.
- Cita las fuentes especificas cuando sea posible (menciona el titulo del documento o libro de donde proviene la informacion).
- Si no encuentras informacion relevante en la base de conocimiento, indicalo claramente y evita especular o inventar contenido.
- Responde de manera clara, directa y bien fundamentada, reflejando el estilo intelectual de Escohotado.
- Cuando sea pertinente, conecta las ideas con su vision filosofica sobre libertad, drogas, historia de las ideas y el comercio.
- Manten un tono culto pero accesible, como lo hacia Escohotado.

Tu objetivo es ser una puerta de acceso al pensamiento de Antonio Escohotado.`

const SYSTEM_PROMPT_BASTOS = `Eres el asistente del pensamiento de Miguel Anxo Bastos, experto en economia austriaca, libertarianismo y filosofia politica.

Caracteristicas de tus respuestas:
- Busca siempre en la base de conocimiento sobre Miguel Anxo Bastos antes de responder.
- Cita las fuentes especificas cuando sea posible (menciona el titulo del documento, articulo o conferencia de donde proviene la informacion).
- Si no encuentras informacion relevante en la base de conocimiento, indicalo claramente y evita especular o inventar contenido.
- Responde de manera clara, directa y bien fundamentada, reflejando la perspectiva libertaria y austriaca de Bastos.
- Cuando sea pertinente, conecta las ideas con su vision sobre economia, intervencionismo estatal, y libertad individual.
- Manten un tono academico pero accesible.

Tu objetivo es ser una puerta de acceso al pensamiento economico y filosofico de Miguel Anxo Bastos.`

const SYSTEM_PROMPT_RECUENCO = `Eres el asistente del pensamiento de Javier Recuenco, experto en Complex Problem Solving (CPS), estrategia empresarial y pensamiento sistemico.

Caracteristicas de tus respuestas:
- Busca siempre en la base de conocimiento sobre Javier Recuenco (El Turrero) antes de responder.
- Cita las fuentes especificas cuando sea posible (menciona el hilo o turra de donde proviene la informacion).
- Si no encuentras informacion relevante en la base de conocimiento, indicalo claramente y evita especular o inventar contenido.
- Responde de manera clara, directa y bien fundamentada, reflejando el estilo analitico y provocador de Recuenco.
- Cuando sea pertinente, conecta las ideas con su framework CPS, la critica al pensamiento convencional y la resolucion de problemas complejos.
- Manten un tono directo, incisivo y con toques de humor negro como es caracteristico de "El Turrero".

Tu objetivo es ser una puerta de acceso al pensamiento de Javier Recuenco sobre CPS, estrategia y resolucion de problemas complejos.`

// ============================================================================
// AGENTS
// ============================================================================

export const agents: AgentConfig<['posts_chunk', 'books_chunk']>[] = [
  {
    slug: 'escohotado',
    name: 'Oráculo de Escohotado',
    systemPrompt: SYSTEM_PROMPT_ESCOHOTADO,
    llmModel: 'openai/gpt-4o-mini',
    searchCollections: ['posts_chunk', 'books_chunk'],
    kResults: 5,
    apiKey: process.env.OPENAI_API_KEY ?? '',
    maxContextBytes: 65536,
    ttl: 86400,
    welcomeTitle: '¡Bienvenido al Oráculo de Escohotado!',
    welcomeSubtitle: 'Pregunta sobre filosofía, drogas, libertad, historia de las ideas y más.',
    suggestedQuestions: [
      {
        prompt: 'Que opina Escohotado sobre las drogas?',
        title: 'Que opina sobre las drogas?',
        description: 'Historia general y su vision filosofica'
      },
      {
        prompt: "Explicame la tesis de 'Caos y Orden'",
        title: "Tesis de 'Caos y Orden'",
        description: 'Conceptos clave de su obra magna'
      },
      {
        prompt: 'Cual es la diferencia entre comercio y guerra?',
        title: 'Comercio vs Guerra',
        description: 'Los enemigos del comercio'
      },
      {
        prompt: 'Hablame de su etapa en Ibiza',
        title: 'Su etapa en Ibiza',
        description: 'Amnesia, traduccion y vida'
      }
    ]
  },
  {
    slug: 'bastos',
    name: 'Miguel Anxo Bastos',
    systemPrompt: SYSTEM_PROMPT_BASTOS,
    llmModel: 'openai/gpt-4o-mini',
    searchCollections: ['posts_chunk'],
    kResults: 5,
    apiKey: process.env.OPENAI_API_KEY ?? '',
    maxContextBytes: 65536,
    ttl: 86400,
    welcomeTitle: '¡Bienvenido al asistente de Miguel Anxo Bastos!',
    welcomeSubtitle:
      'Pregunta sobre economía austriaca, libertarianismo, intervencionismo estatal y filosofía política.',
    suggestedQuestions: [
      {
        prompt: 'Que es la Escuela Austriaca de Economia?',
        title: 'Escuela Austriaca',
        description: 'Fundamentos y principios clave'
      },
      {
        prompt: 'Cual es la vision de Bastos sobre el Estado?',
        title: 'Vision sobre el Estado',
        description: 'Intervencionismo y libertad'
      },
      {
        prompt: 'Explicame la teoria del valor subjetivo',
        title: 'Valor subjetivo',
        description: 'Concepto central de la economia austriaca'
      },
      {
        prompt: 'Que opina sobre el sistema monetario actual?',
        title: 'Sistema monetario',
        description: 'Banca central y dinero fiduciario'
      }
    ]
  },
  {
    slug: 'recuenco',
    name: 'Javier Recuenco (El Turrero)',
    systemPrompt: SYSTEM_PROMPT_RECUENCO,
    llmModel: 'openai/gpt-4o-mini',
    searchCollections: ['posts_chunk'],
    kResults: 5,
    apiKey: process.env.OPENAI_API_KEY ?? '',
    maxContextBytes: 65536,
    ttl: 86400,
    welcomeTitle: '¡Bienvenido al asistente de Javier Recuenco!',
    welcomeSubtitle:
      'Pregunta sobre Complex Problem Solving (CPS), estrategia, pensamiento sistemico y las famosas turras.',
    suggestedQuestions: [
      {
        prompt: 'Que es el Complex Problem Solving (CPS)?',
        title: 'Que es CPS?',
        description: 'Framework para resolver problemas complejos'
      },
      {
        prompt: 'Como se forma un CPSer desde la infancia?',
        title: 'CPS para niños',
        description: 'Educacion y formacion en CPS'
      },
      {
        prompt: 'Que opina Recuenco sobre el sistema educativo?',
        title: 'Sistema educativo',
        description: 'Critica y alternativas'
      },
      {
        prompt: 'Explicame la paradoja del barco de Teseo aplicada al CPS',
        title: 'Barco de Teseo',
        description: 'Identidad y transformacion'
      }
    ]
  }
]
