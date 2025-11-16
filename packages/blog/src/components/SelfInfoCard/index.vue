<script lang="ts" setup>
import {
  computed,
  inject,
  onBeforeUnmount,
  onMounted,
  Ref,
  ref,
  toRefs,
  watch,
  watchEffect,
} from 'vue'
import {
  WeChatOutLined,
  QQOutlined,
  GithubOutlined,
} from '../../../../icons/dist'
import { HeFengWeatherData, openGithub, CurrentLocationArea } from '@/util'
import { StatsResponse } from '@/service/baseRequest'
import { DEFAULT_STATS } from '@/util/data'

const prop = defineProps()
const stats = inject<StatsResponse>('stats', DEFAULT_STATS)!
const { blog_count, category_count, tag_count, total_view_num } = toRefs(stats)

const weatherIcon = computed(() => {
  // console.log(HeFengWeatherData.now.icon)
  return 'qi qi-' + HeFengWeatherData.now.icon
})

// // 监听 props 的变化
// watch(
//   () => prop,
//   (newVal) => {
//     console.log('子组件监听到的 stats 更新:', newVal)
//   },
//   { deep: true, immediate: true } // 确保初始就监听，且深度监听对象
// )
</script>

<template>
  <div class="self-card">
    <div class="avator">
      <img src="/logo.svg" alt="" />
    </div>
    <div class="adress">一个迷人的小屋</div>
    <div class="card-list">
      <div class="card-item">
        <span>{{ $t('info.paper') }}</span>
        <span>{{ blog_count }}</span>
      </div>
      <div class="card-item">
        <span>{{ $t('info.classification') }}</span>
        <span>{{ category_count }}</span>
      </div>
      <div class="card-item">
        <span>{{ $t('info.tag') }}</span>
        <span>{{ tag_count }}</span>
      </div>
      <div class="card-item">
        <span>{{ $t('info.views') }}</span>
        <span>{{ total_view_num }}</span>
      </div>
    </div>
    <div class="icon-list">
      <GithubOutlined @click="openGithub" />
      <WeChatOutLined />
      <QQOutlined />
    </div>
    <hr />
    <div class="tip">有志者，事竟成</div>
  </div>
</template>

<style scoped>
.self-card {
  width: auto;
  height: auto;
  padding: 1.5rem;
  border-radius: 0.5rem;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 18rem 2.5rem 6rem 3rem 1rem 3rem;
  gap: var(--horizontalGapPx);
  background-color: var(--bg-brand-light);

  .avator {
    display: flex;
    justify-content: center;
    img {
      width: auto;
      height: 100%;
      object-fit: contain;
      transition: all 1s ease;
      &:hover {
        transform: rotate(180deg);
      }
    }
  }
  .adress {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
  }
  .card-list {
    display: flex;
    justify-content: space-evenly;
    align-items: center;
    .card-item {
      width: 5rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      & > :first-child {
        font-size: 1.1rem;
      }
      & > :nth-child(2) {
        font-size: 2.8rem;
        font-weight: 400;
      }
    }
  }
  .icon-list {
    display: flex;
    justify-content: space-evenly;
    align-items: center;
    & > *:hover {
      cursor: pointer;
      background-color: var(--icon-bg-hover-color);
    }
  }
  hr {
    width: 100%;
    align-self: center;
  }
  .tip {
    display: flex;
    justify-content: center; /* 水平居中 */
    align-items: center; /* 垂直居中 */
  }
}
</style>
