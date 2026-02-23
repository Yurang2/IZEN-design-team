import type { Env } from './types'

const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

type JsonMap = Record<string, unknown>

export class NotionApi {
  constructor(private readonly env: Env) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${NOTION_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.env.NOTION_TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
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
}
