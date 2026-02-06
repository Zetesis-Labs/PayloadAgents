import type React from 'react'
import type { ImportResult } from './admin-types'

export const ImportResultDisplay: React.FC<{ result: ImportResult | null }> = ({ result }) => {
  if (!result) return null

  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '13px',
        backgroundColor: result.success ? '#dcfce7' : '#fee2e2',
        color: result.success ? '#166534' : '#991b1b'
      }}
    >
      {result.success ? (
        <>
          {result.results && (
            <div>
              {result.dataFile && <>Archivo: {result.dataFile} | </>}
              {result.results.imported} importados, {result.results.skipped} existentes, {result.results.errors.length}{' '}
              errores
            </div>
          )}
          {result.syncResults && (
            <div style={{ marginTop: result.results ? '4px' : '0' }}>
              Sync: {result.syncResults.synced} sincronizados, {result.syncResults.errors.length} errores
            </div>
          )}
          {result.needsSync && (
            <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.8 }}>
              Los documentos se importaron sin indexar. Usa &quot;Sincronizar datos&quot; para indexarlos en Typesense.
            </div>
          )}
        </>
      ) : (
        <>&#10007; {result.message}</>
      )}
    </div>
  )
}
