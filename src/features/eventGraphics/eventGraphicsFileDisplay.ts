import type { ScheduleFile } from '../../shared/types'

export type EventGraphicsDisplayFile = {
  displayName: string
  showImagePreviewBadge: boolean
  emphasisKind: ScheduleFile['kind']
}

const IMAGE_PREVIEW_EXTENSIONS = /\.(png|jpe?g)$/i

export function toEventGraphicsDisplayFile(file: Pick<ScheduleFile, 'kind' | 'name'>): EventGraphicsDisplayFile {
  const trimmedName = file.name.trim()
  const isAliasedImagePreview = file.kind === 'image' && /^V/i.test(trimmedName) && IMAGE_PREVIEW_EXTENSIONS.test(trimmedName)

  if (!isAliasedImagePreview) {
    return {
      displayName: trimmedName,
      showImagePreviewBadge: false,
      emphasisKind: file.kind,
    }
  }

  return {
    displayName: trimmedName.replace(IMAGE_PREVIEW_EXTENSIONS, '.mp4'),
    showImagePreviewBadge: true,
    emphasisKind: 'video',
  }
}

export function joinEventGraphicsDisplayNames(files: ReadonlyArray<ScheduleFile>): string {
  return files.map((file) => toEventGraphicsDisplayFile(file).displayName).join(' / ')
}
