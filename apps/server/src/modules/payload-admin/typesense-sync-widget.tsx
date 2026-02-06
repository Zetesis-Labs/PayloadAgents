'use client'

import type React from 'react'
import { SyncTypesenseButton } from './sync-typesense-button'

export const TypesenseSyncWidget: React.FC = () => {
  return (
    <div
      style={{
        padding: '20px',
        marginTop: '20px',
        backgroundColor: 'var(--theme-elevation-50)',
        borderRadius: '8px',
        border: '1px solid var(--theme-elevation-100)'
      }}
    >
      <h3
        style={{
          margin: '0 0 8px 0',
          fontSize: '16px',
          fontWeight: 600,
          color: 'var(--theme-text)'
        }}
      >
        Typesense Search Index
      </h3>
      <p
        style={{
          margin: '0 0 16px 0',
          fontSize: '14px',
          color: 'var(--theme-elevation-500)'
        }}
      >
        Sincroniza manualmente todos los documentos de Pages con el indice de busqueda de Typesense.
      </p>
      <SyncTypesenseButton />
    </div>
  )
}

export default TypesenseSyncWidget
