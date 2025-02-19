<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { BlogEditorClass } from '@/blogEditor'
import { ElMessage, ElInput, ElSelect, ElOption, ElTree } from 'element-plus'
import ZBtn from '@/components/ZBtn/index.vue'
import { getBlogById, postSaveBlog } from '@/service/request'
const prop = defineProps({
  id: { type: String, default: '' },
})

const editorEle = ref()
const blogWordCount = ref(0)
const blogEditor = ref<BlogEditorClass>(new BlogEditorClass())
const blogCategory = ref('')
const blogTag = ref([])
const saveBlog = async () => {
  ElMessage.success('保存成功')
  const content = blogEditor.value.getContent() || ''
  await postSaveBlog({
    title: title.value,
    content,
    abstract: content.substring(0, 100),
    author: 'test',
    // created_at: 'test'
  }).then((res) => {
    console.log('获取到返回的', res)
  })
  // blogEditor?.value.save()
}

const categoryList = ref([
  {
    id: 1,
    name: '分类1',
  },
  {
    id: 2,
    name: '分类2',
  },
])
const tagList = ref([
  {
    id: 1,
    name: '标签1',
  },
  {
    id: 2,
    name: '标签2',
  },
])

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
  <div class="article-page">
    <div class="func-bar">
      <div class="stastic">{{ '统计信息：字数  ' + blogWordCount }}</div>
      <div class="btn-container">
        <ZBtn @click="saveBlog">{{ $t('save') }}</ZBtn>
      </div>
    </div>
    <div class="title-container">
      <ElInput
        class="title-input"
        placeholder="标题"
        maxlength="100"
        clearable
        show-word-limit
        v-model="title"
      />
      <ElSelect v-model="blogCategory" placeholder="请选择">
        <ElOption
          v-for="item in categoryList"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </ElSelect>
      <ElSelect v-model="blogTag" placeholder="请选择">
        <ElOption
          v-for="item in tagList"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </ElSelect>
      <ElTree :data="categoryList" :props="{ label: 'name' }"></ElTree>
      <ElTree></ElTree>
      <ElRadio></ElRadio>
    </div>
    <div ref="editorEle" class="editor-container"></div>
  </div>
</template>

<style scoped>
.article-page {
  height: 100%;
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
    display: grid;
    /* justify-content: space-between; */
    grid-template-rows: auto;
    grid-template-columns: 3fr 1fr 1fr;
    align-items: center;
    gap: 1rem;
  }
  .editor-container {
    flex: 1;
  }
}
</style>
