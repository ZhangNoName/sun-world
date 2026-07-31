import { useRef, useState } from 'react'
import { SunIcon } from '@sun-world/icons/react'

import type { AiComposerModel } from '../types'

interface ModelSelectorProps {
  models: AiComposerModel[]
  modelId: string
  onModelChange(modelId: string): void
}

export function ModelSelector({
  models,
  modelId,
  onModelChange,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const current = models.find((model) => model.id === modelId)
  const label = current?.label ?? '选择模型'

  return (
    <div className="sw-ai-composer__model-selector">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`选择模型，当前 ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{label}</span>
        <SunIcon name="chevron-down" size="xs" />
      </button>
      {open ? (
        <div role="listbox" aria-label="模型">
          {models.map((model) => (
            <button
              type="button"
              role="option"
              aria-selected={model.id === modelId}
              disabled={model.disabled}
              key={model.id}
              onClick={() => {
                onModelChange(model.id)
                setOpen(false)
                queueMicrotask(() => triggerRef.current?.focus())
              }}
            >
              <strong>{model.label}</strong>
              {model.description ? <span>{model.description}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
