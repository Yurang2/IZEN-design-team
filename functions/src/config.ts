function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env: ${name}`)
  }
  return value
}

export const config = {
  notionToken: required('NOTION_TOKEN'),
  projectDbId: required('NOTION_PROJECT_DB_ID'),
  checklistDbId: required('NOTION_CHECKLIST_DB_ID'),
  taskDbId: required('NOTION_TASK_DB_ID'),
  region: process.env.FUNCTION_REGION || 'asia-northeast3',
  syncDocId: process.env.SYNC_DOC_ID || 'notion_project_sync',
}
