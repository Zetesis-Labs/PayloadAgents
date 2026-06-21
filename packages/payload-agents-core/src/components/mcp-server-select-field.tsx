'use client'

/**
 * Admin field component for `mcpServers`.
 *
 * Loads every MCP server registered in the LiteLLM gateway from the plugin's
 * {basePath}/mcp-servers endpoint and renders them as a multi-select — so the
 * agent can pick from the Payload-managed backends AND any MCP an admin added
 * directly in LiteLLM. Selected values that are no longer registered stay
 * selectable so opening an agent never drops its config.
 */

import { FieldLabel, SelectInput, useField } from '@payloadcms/ui'
import { useEffect, useMemo, useState } from 'react'

interface McpServerOption {
  alias: string
  label?: string
  source?: string
}

interface SelectedOption {
  value?: string | number
}

export function McpServerSelectField(props: { path: string; listPath?: string; readOnly?: boolean }) {
  const { path, listPath = '/api/agents/mcp-servers', readOnly } = props
  const { value, setValue } = useField<string[]>({ path })
  const [servers, setServers] = useState<McpServerOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(listPath, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((body: { servers?: McpServerOption[] }) => {
        if (!cancelled) setServers(body.servers ?? [])
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'fetch failed')
      })
    return () => {
      cancelled = true
    }
  }, [listPath])

  const current = useMemo(() => (Array.isArray(value) ? value : []), [value])

  const options = useMemo(() => {
    const opts = (servers ?? []).map(s => ({
      label: s.source === 'admin' ? `${s.label ?? s.alias} (custom)` : (s.label ?? s.alias),
      value: s.alias
    }))
    for (const v of current) {
      if (!opts.some(o => o.value === v)) opts.push({ label: `${v} (unavailable)`, value: v })
    }
    return opts
  }, [servers, current])

  return (
    <div className="field-type">
      <FieldLabel label="MCP Servers" path={path} />
      <SelectInput
        path={path}
        name={path}
        hasMany
        options={options}
        value={current}
        readOnly={readOnly}
        onChange={option => {
          const arr = (Array.isArray(option) ? option : option ? [option] : []) as SelectedOption[]
          setValue(arr.map(o => o.value).filter((v): v is string => typeof v === 'string'))
        }}
      />
      <div style={{ fontSize: '0.75rem', marginTop: '4px', opacity: 0.8 }}>
        Search backends (MCP servers) this agent can use, routed through LiteLLM.
      </div>
      {error ? (
        <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--theme-error-500)' }}>
          MCP servers unavailable: {error}
        </div>
      ) : null}
    </div>
  )
}
