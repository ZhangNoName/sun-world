import { SwSelect } from '@sun-world/ui/sw-select'

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
  const current = models.find((model) => model.id === modelId)

  return (
    <SwSelect
      aria-label={current ? `选择模型，当前 ${current.label}` : '选择模型'}
      placeholder="选择模型"
      className="sw-ai-composer__model-trigger"
      popupClassName="sw-ai-composer__model-options"
      modal={false}
      size="sm"
      value={current?.id ?? ''}
      onValueChange={onModelChange}
      options={models.map((model) => ({
        value: model.id,
        label: model.label,
        disabled: model.disabled,
        description: model.description ? (
          <span className="sw-ai-model-provider-tag">{model.description}</span>
        ) : undefined,
      }))}
    />
  )
}
