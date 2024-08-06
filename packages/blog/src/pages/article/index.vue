<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import SelfInfoCard from '@/components/SelfInfoCard/index.vue'
import ZHeader from '@/layout/header/index.vue'
import ZFooter from '@/layout/footer/index.vue'
import { BlogEditorClass } from '@/blogEditor'

const prop = defineProps()

const editorEle = ref()
onMounted(() => {
  const blogEditor = new BlogEditorClass(editorEle.value)
  console.log(blogEditor)
})
</script>

<template>
  <div class="article-page page-container">
    <ZHeader></ZHeader>

    <div class="content">
      <div ref="editorEle" class="editor-container"></div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import '../constant.scss';
.article-page {
  .content {
    height: calc(100% - 10rem);
    display: grid;
    grid-template-columns: auto;
    grid-template-rows: auto;
    gap: 1rem;
    .left {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .right {
      // background-color: blue;
    }
  }
}
</style>
