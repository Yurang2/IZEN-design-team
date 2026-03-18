import { useState, type ChangeEvent, type DragEvent } from 'react'

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
  const [isDragging, setIsDragging] = useState(false)
  const isUploading = uploadState?.status === 'uploading'
  const statusClassName = uploadState?.status === 'error' ? 'is-error' : uploadState?.status === 'success' ? 'is-success' : ''

  const uploadSelectedFile = async (file: File | null | undefined) => {
    if (!file || disabled || isUploading) return
    await onUploadFile(rowId, field, file)
  }

  const onChangeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    try {
      await uploadSelectedFile(event.target.files?.[0])
    } finally {
      event.target.value = ''
    }
  }

  const onDragEnter = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    if (disabled || isUploading) return
    setIsDragging(true)
  }

  const onDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    if (disabled || isUploading) return
    event.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }

  const onDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setIsDragging(false)
  }

  const onDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setIsDragging(false)
    await uploadSelectedFile(event.dataTransfer.files?.[0])
  }

  return (
    <div className="eventGraphicsUploadControl">
      <label
        className={`linkButton secondary mini eventGraphicsUploadDropzone${disabled || isUploading ? ' is-disabled' : ''}${isDragging ? ' is-dragging' : ''}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(event) => void onDrop(event)}
      >
        <input type="file" accept={accept} disabled={disabled || isUploading} onChange={(event) => void onChangeFile(event)} />
        {isUploading ? '업로드 중...' : field === 'capture' ? '캡쳐 업로드 / 드롭' : '오디오 업로드 / 드롭'}
      </label>
      {uploadState?.message ? <span className={`eventGraphicsUploadStatus ${statusClassName}`}>{uploadState.message}</span> : null}
    </div>
  )
}
