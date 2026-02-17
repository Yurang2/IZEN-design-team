export type ProposalStatus = 'pending' | 'approved' | 'deleted'

export interface ProjectRecord {
  id: string
  name: string
  eventDate?: string
  categories: string[]
}

export interface ChecklistItem {
  id: string
  productName: string
  workCategory: string
  finalDueText: string
  eventCategories: string[]
}

export interface ProposalRecord {
  id?: string
  status: ProposalStatus
  projectId: string
  projectName: string
  checklistItemId: string
  taskName: string
  workCategory: string
  dueDate?: string
  deadlineBasis: 'event_date'
  offsetDays: number
  dueDateSource: 'rule_table' | 'text_parser'
  finalDueText?: string
  aiDeadlineSuggestion?: {
    deadlineBasis: 'event_date'
    offsetDays: number
  }
  notionTaskPageId?: string
  notionTaskPageUrl?: string
  createdAt?: unknown
  updatedAt?: unknown
  approvedAt?: unknown
}
