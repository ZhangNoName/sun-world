import type { ChangeEventHandler } from 'react'
import { SunIcon } from '@sun-world/icons/react'
import { Label } from '@sun-world/base-ui/label'

interface AiFilePickerProps {
  accept?: string
  disabled?: boolean
  multiple?: boolean
  onChange: ChangeEventHandler<HTMLInputElement>
}

export function AiFilePicker({
  accept,
  disabled,
  multiple = true,
  onChange,
}: AiFilePickerProps) {
  return (
    <Label
      className="sw-ai-composer__icon-button sw-ai-composer__attachment-trigger"
      title="添加附件"
    >
      <SunIcon name="plus" />
      <span className="sr-only">添加附件</span>
      <input
        type="file"
        aria-label="添加附件"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={onChange}
      />
    </Label>
  )
}
