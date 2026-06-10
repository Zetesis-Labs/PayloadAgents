'use client'

/**
 * Admin field component for `llmModel` when the model catalog is enabled.
 *
 * Loads the curated presets from the plugin's {basePath}/models endpoint and
 * renders them as a select with description and required-key hint. The
 * current value stays selectable even if it predates the catalog (legacy
 * documents), so opening an old agent never destroys its config.
 */

import { FieldLabel, SelectInput, useField } from '@payloadcms/ui'
import { useEffect, useMemo, useState } from 'react'

interface CatalogPreset {
  name: string
  description?: string
  requiresKey?: string
  tier?: string
}

interface SelectedOption {
  value?: string | number
}

export function ModelSelectField(props: { path: string; catalogPath?: string; readOnly?: boolean }) {
  const { path, catalogPath = '/api/agents/models', readOnly } = props
  const { value, setValue } = useField<string>({ path })
  const [presets, setPresets] = useState<CatalogPreset[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(catalogPath, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((body: { presets?: CatalogPreset[] }) => {
        if (!cancelled) setPresets(body.presets ?? [])
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'catalog fetch failed')
      })
    return () => {
      cancelled = true
    }
  }, [catalogPath])

  const options = useMemo(() => {
    const opts = (presets ?? []).map(p => ({
      label: p.description ? `${p.name} — ${p.description}` : p.name,
      value: p.name
    }))
    if (value && !opts.some(o => o.value === value)) {
      opts.push({ label: `${value} (legacy — not in catalog)`, value })
    }
    return opts
  }, [presets, value])

  const selected = presets?.find(p => p.name === value)

  return (
    <div className="field-type">
      <FieldLabel label="LLM Model" path={path} required />
      <SelectInput
        path={path}
        name={path}
        options={options}
        value={value}
        readOnly={readOnly}
        onChange={option => {
          const single = (Array.isArray(option) ? option[0] : option) as SelectedOption | null | undefined
          setValue(typeof single?.value === 'string' ? single.value : '')
        }}
      />
      {selected?.requiresKey ? (
        <div style={{ fontSize: '0.75rem', marginTop: '4px', opacity: 0.8 }}>
          Requires a <strong>{selected.requiresKey}</strong> API key (BYOK)
        </div>
      ) : null}
      {error ? (
        <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--theme-error-500)' }}>
          Model catalog unavailable: {error}
        </div>
      ) : null}
    </div>
  )
}
