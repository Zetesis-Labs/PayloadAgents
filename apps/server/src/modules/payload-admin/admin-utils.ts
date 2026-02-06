import type { ImportMode } from './admin-types'

export const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    reader.readAsText(file)
  })
}

export const loadingLabels: Record<ImportMode, string> = {
  'import': 'Importando...',
  'import-sync': 'Importando y sincronizando...',
  'sync': 'Sincronizando...',
}
