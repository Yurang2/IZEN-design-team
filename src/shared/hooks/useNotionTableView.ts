import { useCallback, useState } from 'react'
import { api } from '../api/client'
import type { ScheduleColumn, ScheduleRow } from '../types'
import { toNotionUrlById } from '../utils/format'
import { toErrorMessage } from '../utils/format'

interface NotionTableResponse {
  configured: boolean
  database: {
    title: string
    url?: string | null
    id?: string | null
  }
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
}

export interface NotionTableViewState {
  configured: boolean
  databaseTitle: string
  databaseUrl: string | null
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
}

export function useNotionTableView(endpoint: string, errorFallback: string) {
  const [configured, setConfigured] = useState(false)
  const [databaseTitle, setDatabaseTitle] = useState('')
  const [columns, setColumns] = useState<ScheduleColumn[]>([])
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [databaseUrl, setDatabaseUrl] = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await api<NotionTableResponse>(endpoint)
      setConfigured(response.configured)
      setDatabaseTitle(response.database.title)
      setColumns(response.columns)
      setRows(response.rows)
      setDatabaseUrl(response.database.url ?? toNotionUrlById(response.database.id ?? undefined))
    } catch (err: unknown) {
      setConfigured(false)
      setColumns([])
      setRows([])
      setError(toErrorMessage(err, errorFallback))
    } finally {
      setLoading(false)
    }
  }, [endpoint, errorFallback])

  return {
    configured,
    databaseTitle,
    databaseUrl,
    columns,
    rows,
    loading,
    error,
    fetch: fetch_,
  }
}
