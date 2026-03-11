import type { Env } from './types'

const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const NOTION_FILE_UPLOAD_VERSION = '2025-09-03'

type JsonMap = Record<string, unknown>

export class NotionApi {
  constructor(private readonly env: Env) {}

  private async request<T>(path: string, init?: RequestInit, notionVersion = NOTION_VERSION): Promise<T> {
    const bodyIsForm = typeof FormData !== 'undefined' && init?.body instanceof FormData
    const response = await fetch(`${NOTION_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.env.NOTION_TOKEN}`,
        'Notion-Version': notionVersion,
        ...(bodyIsForm ? {} : { 'Content-Type': 'application/json' }),
        ...(init?.headers ?? {}),
      },
    })

    if (!response.ok) {
      let message = `notion_http_${response.status}`
      try {
        const error = (await response.json()) as { message?: string; code?: string }
        message = error.message || error.code || message
      } catch {
        const text = (await response.text()).trim()
        if (text) message = text.slice(0, 200)
      }
      const wrapped = new Error(message) as Error & { code?: string; status?: number }
      wrapped.status = response.status
      wrapped.code = response.status === 404 ? 'object_not_found' : 'notion_error'
      throw wrapped
    }

    return (await response.json()) as T
  }

  async retrieveDatabase(databaseId: string): Promise<any> {
    return this.request(`/databases/${databaseId}`)
  }

  async queryDatabase(databaseId: string, input: JsonMap): Promise<any> {
    return this.request(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async updateDatabase(databaseId: string, input: JsonMap): Promise<any> {
    return this.request(`/databases/${databaseId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  async retrievePage(pageId: string): Promise<any> {
    return this.request(`/pages/${pageId}`)
  }

  async createPage(input: JsonMap): Promise<any> {
    return this.request('/pages', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async updatePage(pageId: string, input: JsonMap): Promise<any> {
    return this.request(`/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  async listBlockChildren(blockId: string, startCursor?: string): Promise<any> {
    const query = startCursor ? `?start_cursor=${encodeURIComponent(startCursor)}&page_size=100` : '?page_size=100'
    return this.request(`/blocks/${blockId}/children${query}`)
  }

  async appendBlockChildren(blockId: string, children: unknown[], after?: string): Promise<any> {
    return this.request(`/blocks/${blockId}/children`, {
      method: 'PATCH',
      body: JSON.stringify(after ? { children, after } : { children }),
    })
  }

  async updateBlock(blockId: string, input: JsonMap): Promise<any> {
    return this.request(`/blocks/${blockId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  async createFileUpload(filename: string, contentType: string): Promise<any> {
    return this.request(
      '/file_uploads',
      {
        method: 'POST',
        body: JSON.stringify({
          mode: 'single_part',
          filename,
          content_type: contentType,
        }),
      },
      NOTION_FILE_UPLOAD_VERSION,
    )
  }

  async createExternalUrlFileUpload(filename: string, externalUrl: string): Promise<any> {
    return this.request(
      '/file_uploads',
      {
        method: 'POST',
        body: JSON.stringify({
          mode: 'external_url',
          filename,
          external_url: externalUrl,
        }),
      },
      NOTION_FILE_UPLOAD_VERSION,
    )
  }

  async sendFileUpload(fileUploadId: string, bytes: ArrayBuffer, filename: string, contentType: string): Promise<any> {
    const form = new FormData()
    const blob = new Blob([bytes], { type: contentType })
    form.append('file', blob, filename)
    return this.request(
      `/file_uploads/${encodeURIComponent(fileUploadId)}/send`,
      {
        method: 'POST',
        body: form,
      },
      NOTION_FILE_UPLOAD_VERSION,
    )
  }

  async retrieveFileUpload(fileUploadId: string): Promise<any> {
    return this.request(`/file_uploads/${encodeURIComponent(fileUploadId)}`, undefined, NOTION_FILE_UPLOAD_VERSION)
  }
}
