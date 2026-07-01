<script lang="ts" setup>
import MdPreview from 'md-editor-v3/lib/es/MdPreview.mjs'
import 'md-editor-v3/lib/preview.css'
import type { HeadList, MdHeadingId } from 'md-editor-v3'
import type { SunMarkdownHeading } from './types'

defineProps<{
  content: string
}>()

const emit = defineEmits<{
  catalog: [headings: SunMarkdownHeading[]]
  rendered: [html: string]
}>()

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
}

const mdHeadingId: MdHeadingId = ({ text, index }) => {
  const slug = slugify(text) || 'heading'
  return `${slug}-${index + 1}`
}

function mapHeading(heading: HeadList, index: number): SunMarkdownHeading {
  return {
    text: heading.text,
    level: heading.level,
    id: mdHeadingId({
      text: heading.text,
      level: heading.level,
      index,
      currentToken: heading.currentToken,
      nextToken: heading.nextToken,
    }),
  }
}

function handleCatalog(headings: HeadList[]) {
  emit('catalog', headings.map(mapHeading))
}

function handleHtmlChanged(html: string) {
  emit('rendered', html)
}
</script>

<template>
  <MdPreview
    :model-value="content"
    :md-heading-id="mdHeadingId"
    :on-get-catalog="handleCatalog"
    :on-html-changed="handleHtmlChanged"
    class="sun-markdown-preview"
  />
</template>
