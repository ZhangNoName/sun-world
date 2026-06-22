<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { SunChatComposerProps } from '../contracts/chat-composer'
import { isDisabledState } from '../contracts/shared'
import '../styles/base.css'
import '../styles/chat-composer.css'

const props = withDefaults(defineProps<SunChatComposerProps>(), {
  modelValue: '',
  placeholder: '',
  loading: false,
  clearOnSubmit: true,
  submitLabel: 'Send',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: [value: string]
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const draft = ref(props.modelValue)
const isDisabled = computed(() => isDisabledState(props) || props.loading)
const text = computed({
  get: () => draft.value,
  set: (value: string) => {
    if (isDisabled.value) return
    draft.value = value
    emit('update:modelValue', value)
  },
})
const canSubmit = computed(
  () => text.value.trim().length > 0 && !isDisabled.value
)

function resize() {
  const target = textareaRef.value
  if (!target) return
  target.style.height = 'auto'
  target.style.height = `${Math.min(target.scrollHeight, 180)}px`
}

async function clearText() {
  draft.value = ''
  emit('update:modelValue', '')
  await nextTick()
  resize()
}

function submit() {
  if (!canSubmit.value) return
  const value = text.value.trim()
  emit('submit', value)
  if (props.clearOnSubmit) {
    void clearText()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  submit()
}

watch(
  () => props.modelValue,
  (value) => {
    draft.value = value
    void nextTick(resize)
  }
)
</script>

<template>
  <form class="sun-chat-composer" @submit.prevent="submit">
    <div v-if="$slots.leading" class="sun-chat-composer__leading">
      <slot name="leading" />
    </div>
    <textarea
      ref="textareaRef"
      v-model="text"
      class="sun-chat-composer__input"
      rows="1"
      :placeholder="placeholder"
      :disabled="isDisabled"
      :aria-label="ariaLabel || placeholder || 'Message'"
      @input="resize"
      @keydown="handleKeydown"
    />
    <div v-if="$slots.trailing" class="sun-chat-composer__trailing">
      <slot name="trailing" />
    </div>
    <button
      class="sun-chat-composer__submit"
      type="submit"
      :disabled="!canSubmit"
      :aria-label="submitLabel"
    >
      <slot name="submit" :loading="loading">
        {{ loading ? '...' : submitLabel }}
      </slot>
    </button>
  </form>
</template>
