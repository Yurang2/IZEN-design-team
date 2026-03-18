import { type ChangeEvent } from 'react'

export type AssetUploadField = 'capture' | 'audio'

export type UploadState = {
  status: 'idle' | 'uploading' | 'success' | 'error'
  message: string | null
}

export function toUploadStateKey(rowId: string, field: AssetUploadField): string {
  return `${rowId}:${field}`
}

export function AssetUploadControl({
  rowId,
  field,
  accept,
  uploadState,
  disabled,
  onUploadFile,
}: {
  rowId: string
  field: AssetUploadField
  accept: string
  uploadState?: UploadState
  disabled?: boolean
  onUploadFile: (rowId: string, field: AssetUploadField, file: File) => Promise<void>
}) {
  const isUploading = uploadState?.status === 'uploading'
  const statusClassName = uploadState?.status === 'error' ? 'is-error' : uploadState?.status === 'success' ? 'is-success' : ''

  const onChangeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || disabled || isUploading) return
    try {
      await onUploadFile(rowId, field, file)
    } finally {
      event.target.value = ''
    }
  }

  return (
    <div className="eventGraphicsUploadControl">
      <label className={`linkButton secondary mini${disabled || isUploading ? ' is-disabled' : ''}`}>
        <input type="file" accept={accept} disabled={disabled || isUploading} onChange={(event) => void onChangeFile(event)} />
        {isUploading ? '업로드 중...' : field === 'capture' ? '캡쳐 업로드' : '오디오 업로드'}
      </label>
      {uploadState?.message ? <span className={`eventGraphicsUploadStatus ${statusClassName}`}>{uploadState.message}</span> : null}
    </div>
  )
}
