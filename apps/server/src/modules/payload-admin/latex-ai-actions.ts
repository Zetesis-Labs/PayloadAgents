'use server'

import OpenAI from 'openai'

export interface LatexAIRequest {
  instruction: string
  currentLatex: string
  compilationErrors: string | null
}

export interface LatexAIResponse {
  success: boolean
  latex?: string
  message: string
}

const SYSTEM_PROMPT = `Eres un experto en LaTeX. El usuario te dará un documento LaTeX junto con una instrucción y opcionalmente los errores de compilación del compilador pdflatex.

Tu trabajo es modificar el documento LaTeX según la instrucción del usuario. Si hay errores de compilación, tenlos en cuenta para corregirlos.

Reglas:
- Responde ÚNICAMENTE con el documento LaTeX completo modificado, sin explicaciones ni markdown.
- No envuelvas el resultado en bloques de código (\`\`\`).
- Mantén el documento funcional y compilable con pdflatex.
- Si la instrucción pide algo que no tiene sentido, devuelve el documento original sin cambios.`

export async function askLatexAI(request: LatexAIRequest): Promise<LatexAIResponse> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { success: false, message: 'OPENAI_API_KEY no está configurada en las variables de entorno.' }
  }

  const client = new OpenAI({ apiKey })

  let userMessage = `## Documento LaTeX actual:\n\n${request.currentLatex}\n\n## Instrucción:\n\n${request.instruction}`

  if (request.compilationErrors) {
    userMessage += `\n\n## Errores de compilación de pdflatex:\n\n${request.compilationErrors}`
  }

  try {
    const response = await client.responses.create({
      model: 'o4-mini',
      instructions: SYSTEM_PROMPT,
      input: userMessage
    })

    const latex = response.output_text?.trim()

    if (!latex) {
      return { success: false, message: 'El modelo no devolvió contenido.' }
    }

    return { success: true, latex, message: 'LaTeX actualizado por IA.' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido al llamar a OpenAI.'
    return { success: false, message }
  }
}
