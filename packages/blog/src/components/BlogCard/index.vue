<script setup lang="ts">
import { inject, ref, watchEffect } from 'vue'
import {
  Calendar,
  WordCount,
  Comment,
  Clock,
  TagSvg,
} from '@sun-world/icons-vue'
import Tag from '../Tag/index.vue'
import { BlogCardProps } from '@/type'
import { useRouter } from 'vue-router'
import { StatsResponse } from '@/service/baseRequest'
const props = defineProps<BlogCardProps>()

const {
  title,
  abstract,
  // publishTime,
  lastUpdateTime,
  tags,
  category = 'js',
  // cover = '1',
  byteNum = 10000,
  commentNum = 0,
  viewNum = 0,
  id,
} = props
const iconConfig = ref({
  height: '1.8rem',
  width: '1.8rem',
})

const router = useRouter()
const showBlog = () => {
  console.log('执行跳转')
  router.push({ path: '/blog', query: { id: id } })
}
</script>
<template>
  <article class="z-blog-card">
    <div class="header">
      <div class="tag">
        <Calendar v-bind="iconConfig" />
        <span>{{ publishTime }}</span>
      </div>
      <div class="tag">
        <Comment v-bind="iconConfig" />
        <span>{{ commentNum.toLocaleString() }}</span>
      </div>
      <div class="tag">
        <WordCount v-bind="iconConfig" />
        <span>{{ byteNum.toLocaleString() }}</span>
      </div>
    </div>
    <h1 class="title">
      <a>{{ title }}</a>
    </h1>
    <div class="body">{{ abstract }}</div>
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

<style scoped>
.z-blog-card {
  margin-top: 1.5rem;
  border-color: var(--border-default);
  background-color: var(--bg-brand-light);
  color: var(--text-default);
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  padding: 1.5rem;
  gap: 0.5rem;
  .header {
    font-size: 1.1rem;

    color: var(--text-secondary);
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 1.5rem;
    .tag {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 0.5rem;
    }
    /* span {
        height: 1.1rem;
        line-height: 1.1rem;
      } */
  }
  .title {
    height: fit-content;

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
