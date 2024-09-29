<script lang="ts" setup>
import { ref } from 'vue'
import SelfInfoCard from '@/components/SelfInfoCard/index.vue'
import CatalogCard from '@/components/CatalogCard/index.vue'
import { useRoute } from 'vue-router'
import { onMounted } from 'vue'
import { getBlogById } from '@/service/request'
import { ElMessage } from 'element-plus'
interface Props {}
const props: Props = defineProps()
const route = useRoute()
const id = ref<string>((route.query.id as string) || '')

onMounted(() => {
  if (!id.value) {
    ElMessage.error('未找到相应的博客id')
    return
  }
  getBlogById(id.value)
    .then((res) => {
      console.log('获取到的博客内容', res.data)
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
    <div class="right"></div>
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
  }
}
</style>
