<script setup lang="ts">
import { ref } from 'vue'
import {
  Calendar,
  WordCount,
  Comment,
  Clock,
  TagSvg,
} from '@sun-world/icons-vue'
import Tag from '../Tag/index.vue'
import { BlogCardProps } from '@/type'
import { useRoute, useRouter } from 'vue-router'
const props = defineProps<BlogCardProps>()

const {
  title,
  content,
  publishTime,
  lastUpdateTime,
  tags,
  category,
  cover,
  byteNum,
  commentNum,
} = props
const iconConfig = ref({
  height: '1.8rem',
  width: '1.8rem',
})

const router = useRouter()
const route = useRoute()
const showBlog = () => {
  console.log('执行跳转')
  router.push({ path: '/blog' })
}
</script>
<template>
  <article class="z-blog-card">
    <div class="header">
      <Calendar v-bind="iconConfig" />
      <span>{{ publishTime }}</span>
      <Comment v-bind="iconConfig" />
      <span>{{ commentNum }}</span>

      <Clock v-bind="iconConfig" />
      <span>{{ lastUpdateTime }}</span>
      <WordCount v-bind="iconConfig" />
      <span>{{ byteNum }}</span>
    </div>
    <h1 class="title">
      <a>{{ title }}</a>
    </h1>
    <div class="body">{{ content }}</div>
    <div class="footer">
      <div class="tag">
        <TagSvg v-bind="iconConfig" />
        <Tag v-for="tag in tags" :key="tag" :tag="tag" :url="''" />
      </div>
      <hr />
      <div class="operate">
        <a @click="showBlog">{{ $t('readMore') }}...</a>

        <div class="last-update">
          <Calendar v-bind="iconConfig" />
          {{ lastUpdateTime }}
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.z-blog-card {
  margin-top: 1.5rem;
  border-color: var(--blog-card-border-color);
  background-color: var(--blog-card-bg-color);
  color: var(--blog-card-font-color);
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  padding: 1.5rem;
  gap: 0.5rem;
  .header {
    font-size: 1.1rem;
    height: 4rem;
    color: var(--blog-card-tag-color);
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 0.5rem;
    /* span {
        height: 1.1rem;
        line-height: 1.1rem;
      } */
  }
  .title {
    height: 3rem;
    line-height: 3rem;
    font-size: 2.8rem;
    /* font-weight: 600; */
    text-align: left;
  }
  .body {
    min-height: 10rem;
    text-align: left;
  }
  .footer {
    height: 6rem;
    display: flex;
    flex-direction: column;
    .tag {
      height: 3rem;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 0.5rem;
    }
    hr {
      width: 100%;
    }
    .operate {
      display: flex;
      align-items: center;
      justify-content: space-between;

      & > :first-child {
        background-color: var(--btn-bg-color);
        border-radius: 0.5rem;
        padding: 0.25rem 1rem;
        cursor: pointer;
      }
      .last-update {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        font-size: 1.1rem;
        gap: 0.5rem;
      }
    }
  }
}
</style>
