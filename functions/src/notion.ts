import { Client } from '@notionhq/client'
import { config } from './config'
import type { ChecklistItem, ProjectRecord } from './types'

const PROJECT_PROP = {
  name: '프로젝트명',
  eventDate: '행사 진행일',
  eventCategory: '행사 분류',
}

const CHECKLIST_PROP = {
  productName: '제작물',
  workCategory: '작업 분류',
  finalDueText: '최종 완료 시점',
  eventCategory: '행사 분류',
}

const TASK_PROP = {
  taskName: '업무',
  relationProject: '귀속 프로젝트',
  dueDate: '마감일',
  assignee: '담당자',
  status: '상태',
  workType: '업무구분',
}

type AnyMap = Record<string, any>

function normalizeText(value: string): string {
  return value.trim()
}

function splitCsvText(value: string): string[] {
  return value
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean)
}

function extractTitle(props: AnyMap, name: string): string {
  const prop = props[name]
  if (!prop) return ''
  if (prop.type === 'title') {
    return (prop.title ?? []).map((v: any) => v.plain_text).join('').trim()
  }
  return ''
}

function extractRichText(props: AnyMap, name: string): string {
  const prop = props[name]
  if (!prop) return ''
  if (prop.type === 'rich_text') {
    return (prop.rich_text ?? []).map((v: any) => v.plain_text).join('').trim()
  }
  if (prop.type === 'select') {
    return prop.select?.name ?? ''
  }
  return ''
}

function extractDate(props: AnyMap, name: string): string | undefined {
  const prop = props[name]
  if (!prop || prop.type !== 'date') return undefined
  return prop.date?.start
}

function extractCategory(props: AnyMap, name: string): string[] {
  const prop = props[name]
  if (!prop) return []

  if (prop.type === 'multi_select') {
    return (prop.multi_select ?? []).map((v: any) => normalizeText(v.name)).filter(Boolean)
  }

  if (prop.type === 'select') {
    return prop.select?.name ? [normalizeText(prop.select.name)] : []
  }

  if (prop.type === 'rich_text') {
    return splitCsvText((prop.rich_text ?? []).map((v: any) => v.plain_text).join(''))
  }

  return []
}

export class NotionService {
  private client = new Client({ auth: config.notionToken })

  private async queryAll(databaseId: string): Promise<any[]> {
    const pages: any[] = []
    let cursor: string | undefined

    while (true) {
      const response: any = await this.client.databases.query({
        database_id: databaseId,
        start_cursor: cursor,
        page_size: 100,
      })
      pages.push(...response.results)
      if (!response.has_more || !response.next_cursor) {
        break
      }
      cursor = response.next_cursor
    }

    return pages
  }

  async fetchProjects(): Promise<ProjectRecord[]> {
    const pages = await this.queryAll(config.projectDbId)
    return pages.map((page) => {
      const props = page.properties as AnyMap
      return {
        id: page.id,
        name: extractTitle(props, PROJECT_PROP.name) || '제목 없음 프로젝트',
        eventDate: extractDate(props, PROJECT_PROP.eventDate),
        categories: extractCategory(props, PROJECT_PROP.eventCategory),
      }
    })
  }

  async fetchChecklist(): Promise<ChecklistItem[]> {
    const pages = await this.queryAll(config.checklistDbId)
    return pages.map((page) => {
      const props = page.properties as AnyMap
      return {
        id: page.id,
        productName: extractTitle(props, CHECKLIST_PROP.productName) || '제작물',
        workCategory: extractRichText(props, CHECKLIST_PROP.workCategory),
        finalDueText: extractRichText(props, CHECKLIST_PROP.finalDueText),
        eventCategories: extractCategory(props, CHECKLIST_PROP.eventCategory),
      }
    })
  }

  private async getTaskDbPropertyTypes(): Promise<Record<string, string>> {
    const db: any = await this.client.databases.retrieve({ database_id: config.taskDbId })
    const types: Record<string, string> = {}
    for (const [name, value] of Object.entries<any>(db.properties ?? {})) {
      types[name] = value.type
    }
    return types
  }

  async createTask(input: {
    taskName: string
    workCategory: string
    projectPageId: string
    dueDate?: string
    statusName?: string
  }): Promise<{ id: string; url: string }> {
    const propertyTypes = await this.getTaskDbPropertyTypes()

    const properties: AnyMap = {}

    if (propertyTypes[TASK_PROP.taskName] === 'title') {
      properties[TASK_PROP.taskName] = {
        title: [{ text: { content: input.taskName } }],
      }
    }

    if (propertyTypes[TASK_PROP.workType] === 'select') {
      properties[TASK_PROP.workType] = { select: { name: input.workCategory || '기타' } }
    } else if (propertyTypes[TASK_PROP.workType] === 'rich_text') {
      properties[TASK_PROP.workType] = { rich_text: [{ text: { content: input.workCategory } }] }
    }

    if (propertyTypes[TASK_PROP.relationProject] === 'relation') {
      properties[TASK_PROP.relationProject] = {
        relation: [{ id: input.projectPageId }],
      }
    }

    if (input.dueDate && propertyTypes[TASK_PROP.dueDate] === 'date') {
      properties[TASK_PROP.dueDate] = { date: { start: input.dueDate } }
    }

    const statusName = input.statusName || '진행 전'
    if (propertyTypes[TASK_PROP.status] === 'status') {
      properties[TASK_PROP.status] = { status: { name: statusName } }
    } else if (propertyTypes[TASK_PROP.status] === 'select') {
      properties[TASK_PROP.status] = { select: { name: statusName } }
    }

    const created: any = await this.client.pages.create({
      parent: { database_id: config.taskDbId },
      properties,
    })

    return {
      id: created.id,
      url: created.url,
    }
  }
}
