import { SunIcon } from '@sun-world/icons/react'

import { filePresentation } from './filePresentation'
import { ImageAttachmentPreview } from './ImageAttachmentPreview'

interface AttachmentListProps {
  files: File[]
  onRemove(index: number): void
}

export function AttachmentList({ files, onRemove }: AttachmentListProps) {
  if (!files.length) return null
  return (
    <ul className="sw-ai-composer__attachments" aria-label="附件">
      {files.map((file, index) => {
        const presentation = filePresentation(file)
        return (
          <li
            className={`sw-ai-composer__attachment sw-ai-composer__attachment--${presentation.kind}`}
            key={`${file.name}:${file.size}:${file.lastModified}`}
          >
            {presentation.kind === 'image' ? (
              <ImageAttachmentPreview file={file} />
            ) : (
              <span className="sw-ai-composer__attachment-icon">
                <SunIcon
                  name={presentation.icon}
                  size="md"
                  data-testid={`attachment-icon-${presentation.icon}`}
                />
              </span>
            )}
            <span className="sw-ai-composer__attachment-copy">
              <strong>{file.name}</strong>
            </span>
            <button
              type="button"
              aria-label={`移除 ${file.name}`}
              onClick={() => onRemove(index)}
            >
              <SunIcon name="x" size="xs" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
