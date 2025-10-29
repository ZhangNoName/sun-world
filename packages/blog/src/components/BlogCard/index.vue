<script setup lang="ts">
import { inject, ref, watchEffect } from 'vue'

import Tag from '../Tag/index.vue'
import { BlogCardProps } from '@/type'
import { useRouter } from 'vue-router'
import { StatsResponse } from '@/service/baseRequest'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'
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
        <SvgIcon name="calender" />
        <span>{{ publishTime }}</span>
      </div>
      <div class="tag">
        <SvgIcon name="comment" />
        <span>{{ commentNum.toLocaleString() }}</span>
      </div>
      <div class="tag">
        <SvgIcon name="font-num" />
        <span>{{ byteNum.toLocaleString() }}</span>
      </div>
    </div>
    <h1 class="title">
      <a>{{ title }}</a>
    </h1>
    <div class="body">{{ abstract }}</div>
    <div class="footer">
      <div class="tag">
        <SvgIcon name="tag" />
        <Tag v-for="tag in tags" :key="tag" :tag="tag" :url="''" />
      </div>
      <hr />
      <div class="operate">
        <a @click="showBlog">{{ $t('readMore') }}...</a>

        <div class="last-update">
          <SvgIcon name="calender" />
          {{ lastUpdateTime }}
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.z-blog-card {
  border-color: var(--border-default);
  background-color: var(--bg-brand-light);
  color: var(--text-default);
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  padding: var(--horizontalGapPx);
  gap: 0.5rem;

  .header {
    color: var(--text-secondary);
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: var(--horizontalGapPx);
    cursor: pointer;
    .tag {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 5px;
    }
  }
  .title {
    height: fit-content;
    cursor: pointer;
    font-size: var(--font-large);
    /* font-weight: 600; */
    text-align: left;
    &:hover {
      color: var(--text-hover);
    }
  }
  .body {
    text-align: left;
  }
  .footer {
    height: 6rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    .tag {
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
    }
    hr {
      width: 100%;
    }
    .operate {
      display: flex;
      align-items: center;
      justify-content: space-between;

      & > :first-child {
        background-color: var(--bg-component);
        border-radius: var(--border-radius);
        padding: 0 var(--paddingPx);
        cursor: pointer;
        height: 30px;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .last-update {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        font-size: var(--font-small);
        gap: 0.5rem;
      }
    }
  }
}
</style>
