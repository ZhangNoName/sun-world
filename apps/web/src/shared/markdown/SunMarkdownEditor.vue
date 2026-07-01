<script lang="ts" setup>
import MdEditor from 'md-editor-v3/lib/es/MdEditor.mjs'
import 'md-editor-v3/lib/style.css'

const content = defineModel<string>({ required: true })
</script>

<template>
  <MdEditor v-model="content" class="sun-markdown-editor" />
</template>

<style scoped>
.sun-markdown-editor {
  width: 100%;
  height: 100%;
}
</style>
