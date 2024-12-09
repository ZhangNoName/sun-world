<script lang="ts" setup>
import { ref } from 'vue'
import SelfInfoCard from '@/components/SelfInfoCard/index.vue'
import CatalogCard from '@/components/CatalogCard/index.vue'
import { useRoute } from 'vue-router'
import { onMounted } from 'vue'
import { BlogDeatil, getBlogById } from '@/service/request'
import { ElMessage } from 'element-plus'
import {
  Calendar,
  WordCount,
  Comment,
  Clock,
  TagSvg,
} from '@sun-world/icons-vue'
interface Props {}
const props: Props = defineProps()
const iconConfig = ref({
  height: '1.8rem',
  width: '1.8rem',
})
const route = useRoute()
const id = ref<string>((route.query.id as string) || '')
const blogInfo = ref<BlogDeatil>({
  author: '',
  content: '',
  created_at: '',
  id: '',
  title: '',
  update_at: '',
})
onMounted(() => {
  if (!id.value) {
    ElMessage.error('未找到相应的博客id')
    return
  }
  getBlogById(id.value)
    .then((res) => {
      console.log('获取到的博客内容', res)
      blogInfo.value = res
    })
    .catch((err) => {
      console.log('获取博客内容失败', err)
      ElMessage.error('获取博客内容失败！')
    })
    .finally(() => {
      console.log('获取博客内容完成')
    })
})
</script>

<template>
  <div class="blog-page">
    <div class="left">
      <CatalogCard />
      <SelfInfoCard />
    </div>
    <div class="right">
      <div class="data-info">
        <div class="tag">
          <Calendar v-bind="iconConfig" />
          <span>{{ blogInfo.created_at }}</span>
        </div>
        <div class="tag">
          <Comment v-bind="iconConfig" />
          <span>{{ 0 }}</span>
        </div>
        <div class="tag">
          <WordCount v-bind="iconConfig" />
          <span>{{ 1000 }}</span>
        </div>
      </div>
      <h1>{{ blogInfo.title }}</h1>
      {{ blogInfo.content }}
    </div>
  </div>
</template>

<style scoped>
.blog-page {
  position: relative;
  margin: 6.5rem auto 0 auto;
  height: auto;
  min-height: calc(100vh - 37rem);
  background-color: var(--bg-color);
  width: 85%;
  display: grid;
  grid-template-columns: 35rem auto;
  grid-template-rows: auto;
  gap: 1rem;
  .left {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .right {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
    gap: 1rem;
    .data-info {
      height: 4rem;
      font-size: 1.2rem;
      display: flex;
      justify-content: flex-start;
      align-items: center;
      gap: 1rem;
      .tag {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
    }
  }
}
</style>
