import { useLayoutEffect, useRef, useState } from 'react'
import type { AiComposerProps } from '@sun-world/ai-composer'
import { SunIcon } from '@sun-world/icons/react'
import { SwButton } from '@sun-world/ui/sw-button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@sun-world/ui/sw-dropdown-menu'

import type { AiReasoningEffort } from '../composables/useAiChat'

const reasoningLabels = {
  low: '低',
  medium: '中',
  high: '高',
} satisfies Record<AiReasoningEffort, string>
const reasoningOptions = ['low', 'medium', 'high'] as const

function modelLabel(label: string) {
  return label === 'gpt-6.1-sol' ? 'GPT-6.1 Sol' : label
}

export function AiModelControl({
  models,
  modelId,
  onModelChange,
  reasoning,
}: Pick<AiComposerProps, 'models' | 'modelId' | 'onModelChange'> & {
  reasoning?: {
    effort: AiReasoningEffort
    onEffortChange: (effort: AiReasoningEffort) => void
  }
}) {
  const [open, setOpen] = useState(false)
  const [showModels, setShowModels] = useState(false)
  const popup = useRef<HTMLDivElement>(null)
  const modelView = !reasoning || showModels
  const current = models.find((model) => model.id === modelId)
  const currentLabel = current ? modelLabel(current.label) : '选择模型'
  const effortLabel = reasoning ? reasoningLabels[reasoning.effort] : undefined
  const label = effortLabel
    ? `模型与思考程度，${currentLabel}，${effortLabel}`
    : `选择模型，当前 ${currentLabel}`

  useLayoutEffect(() => {
    if (!open) return
    const content = popup.current
    const focusTarget = modelView
      ? content?.querySelector<HTMLElement>(
          '[role="menuitemradio"][aria-checked="true"]:not([aria-disabled="true"])'
        )
      : content?.querySelector<HTMLElement>('[role="menuitem"]')
    focusTarget?.focus()
  }, [modelView, open])

  return (
    <div className="sw-ai-model-control-wrap">
      <DropdownMenu
        orientation={modelView ? 'vertical' : 'horizontal'}
        modal={false}
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) setShowModels(false)
        }}
      >
        <DropdownMenuTrigger asChild aria-label={label}>
          <SwButton
            type="button"
            variant="ghost"
            size="sm"
            className="sw-ai-model-control"
          >
            <span className="sw-ai-model-control__name">{currentLabel}</span>
            {effortLabel ? (
              <span className="sw-ai-model-control__effort">{effortLabel}</span>
            ) : null}
          </SwButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          ref={popup}
          align="end"
          side="bottom"
          sideOffset={6}
          aria-label={modelView ? '选择模型' : '模型与思考程度'}
          className="sw-ai-model-menu"
        >
          {modelView ? (
            <>
              {reasoning ? (
                <DropdownMenuItem
                  closeOnClick={false}
                  className="sw-ai-model-menu__link"
                  onClick={() => setShowModels(false)}
                >
                  <SunIcon name="chevron-left" size="xs" />
                  返回思考程度
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuRadioGroup
                aria-label="可用模型"
                value={modelId}
                onValueChange={onModelChange}
              >
                {models.map((model) => (
                  <DropdownMenuRadioItem
                    key={model.id}
                    value={model.id}
                    disabled={model.disabled}
                  >
                    <span className="sw-ai-model-menu__model">
                      <span>{modelLabel(model.label)}</span>
                      {model.description ? (
                        <small>{model.description}</small>
                      ) : null}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </>
          ) : reasoning ? (
            <>
              <DropdownMenuItem
                closeOnClick={false}
                className="sw-ai-model-menu__link"
                aria-label={`选择模型，当前 ${currentLabel}`}
                onClick={() => setShowModels(true)}
              >
                <strong>{currentLabel}</strong>
                <SunIcon name="chevron-right" size="xs" />
              </DropdownMenuItem>
              <DropdownMenuRadioGroup
                aria-label="思考程度"
                className="sw-ai-model-menu__options"
                value={reasoning.effort}
                onValueChange={(value) => {
                  const selected = reasoningOptions.find(
                    (option) => option === value
                  )
                  if (selected) reasoning.onEffortChange(selected)
                }}
              >
                {reasoningOptions.map((value) => (
                  <DropdownMenuRadioItem
                    key={value}
                    value={value}
                    className="sw-ai-model-menu__option"
                  >
                    {reasoningLabels[value]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
