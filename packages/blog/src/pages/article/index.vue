<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import ZHeader from '@/layout/header/index.vue'
import { BlogEditorClass } from '@/blogEditor'
import { ElMessage, ElInput } from 'element-plus'
import ZBtn from '@/components/ZBtn/index.vue'
import { getBlogById, postSaveBlog } from '@/service/request'
import { watchEffect } from 'vue'
const prop = defineProps({
  id: { type: String, default: '' },
})

const editorEle = ref()
const blogWordCount = ref(0)
const blogEditor = ref<BlogEditorClass>(new BlogEditorClass())
const saveBlog = async () => {
  console.log(blogEditor.value.getContent())
  console.log('saveBlog')
  ElMessage.success('保存成功')
  await postSaveBlog({
    title: title.value,
    content: blogEditor.value.getContent() || '',
    // author: 'test',
    // created_at: 'test'
  }).then((res) => {
    console.log(res)
  })
  // blogEditor?.value.save()
}

const title = ref('')

onMounted(() => {
  blogEditor.value.init(editorEle.value)
  // console.log(blogEditor)
  // 将blogEditor挂载到全局
  ;(window as any).blogEditor = blogEditor

  blogEditor.value.setConfig({
    input: (v) => {
      blogWordCount.value = v.length
    },
  })
  if (prop.id) {
    getBlogById(prop.id).then((res: any) => {
      console.log('获取到的博客内容', res)
    })
  }
})
</script>

<template>
  <div class="article-page page-container">
    <ZHeader></ZHeader>

    <div class="content">
      <div class="func-bar">
        <div class="stastic">{{ '统计信息：字数  ' + blogWordCount }}</div>
        <div class="btn-container">
          <ZBtn @click="saveBlog">{{ $t('save') }}</ZBtn>
        </div>
      </div>
      <ElInput
        class="title-container"
        placeholder="标题"
        maxlength="100"
        clearable
        show-word-limit
        v-model="title"
      />
      <div ref="editorEle" class="editor-container"></div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import '../constant.scss';
.article-page {
  .content {
    height: calc(100% - 10rem);
    // width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
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
    .title-container {
      height: 3rem;
      width: 100%;
    }
    .editor-container {
      // width: 100%;
    }
  }
}
</style>
