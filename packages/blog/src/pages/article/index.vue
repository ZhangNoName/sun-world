<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import ZHeader from '@/layout/header/index.vue'
import { BlogEditorClass } from '@/blogEditor'
import { ElMessage } from 'element-plus'
import ZBtn from '@/components/ZBtn/index.vue'
const prop = defineProps()

const editorEle = ref()
const blogEditor = ref<BlogEditorClass>(new BlogEditorClass())
const saveBlog = () => {
  console.log(blogEditor.value.getContent())
  console.log('saveBlog')
  ElMessage.success('保存成功')
  // blogEditor?.value.save()
}
onMounted(() => {
  blogEditor.value.init(editorEle.value)
  // console.log(blogEditor)
  // 将blogEditor挂载到全局
  ;(window as any).blogEditor = blogEditor
})
</script>

<template>
  <div class="article-page page-container">
    <ZHeader></ZHeader>

    <div class="content">
      <div class="func-bar">
        <div class="stastic">统计信息</div>
        <div class="btn-container"><ZBtn @click="saveBlog">保存</ZBtn></div>
      </div>
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
    .func-bar {
      height: 3rem;
      width: 100%;
      display: flex;
      align-items: center;
      .stastic {
        flex: 1;
      }
      .btn-container {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        align-items: center;
      }
    }
  }
}
</style>
