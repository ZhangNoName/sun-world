import { SunIcon } from '@sun-world/icons/react'

interface AttachmentListProps {
  files: File[]
  onRemove(index: number): void
}

export function AttachmentList({ files, onRemove }: AttachmentListProps) {
  if (!files.length) return null
  return (
    <ul className="sw-ai-composer__attachments" aria-label="附件">
      {files.map((file, index) => (
        <li key={`${file.name}:${file.size}:${file.lastModified}`}>
          <SunIcon name="file-text" size="sm" />
          <span className="sw-ai-composer__attachment-copy">
            <strong>{file.name}</strong>
            <small>{formatFileSize(file.size)}</small>
          </span>
          <button
            type="button"
            aria-label={`移除 ${file.name}`}
            onClick={() => onRemove(index)}
          >
            <SunIcon name="x" size="xs" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
