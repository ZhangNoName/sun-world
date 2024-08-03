<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  WeChatOutLined,
  QQOutlined,
  GithubOutlined,
} from '@sun-world/icons-vue'
import { HeFengWeatherData, openGithub, CurrentLocationArea } from '@/util'

const prop = defineProps()
const blogNum = ref(0)
const seriesNum = ref(0)
const tagNum = ref(0)
const commentNum = ref(0)
const viewsNum = ref(0)

const weatherIcon = computed(() => {
  console.log(HeFengWeatherData.now.icon)
  return 'qi qi-' + HeFengWeatherData.now.icon
})
</script>

<template>
  <div class="self-card">
    <div class="avator">
      <img src="/logo.png" alt="" />
    </div>
    <div class="adress">一个迷人的小屋</div>
    <div class="card-list">
      <div class="card-item">
        <span>{{ $t('info.paper') }}</span>
        <span>{{ blogNum }}</span>
      </div>
      <div class="card-item">
        <span>{{ $t('info.classification') }}</span>
        <span>{{ seriesNum }}</span>
      </div>
      <div class="card-item">
        <span>{{ $t('info.tag') }}</span>
        <span>{{ tagNum }}</span>
      </div>
      <div class="card-item">
        <span>{{ $t('info.views') }}</span>
        <span>{{ viewsNum }}</span>
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

<style lang="scss" scoped>
.self-card {
  width: auto;
  height: auto;
  padding: 1.5rem;
  border-radius: 0.5rem;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 18rem 2.5rem 6rem 3rem 1rem 3rem;

  gap: 1.5rem;
  background-color: var(--bg-color-0);

  .avator {
    img {
      width: auto;
      height: 100%;
      object-fit: contain;
      transition: all 1s ease;
      border-radius: 50%;
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
    // background-color: bisque;
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
    // background-color: yellow;
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
    height: 0.2rem;
    // border-radius: 0.1rem;
    // height: max-content;
  }
  .tip {
    display: flex;
    justify-content: center; /* 水平居中 */
    align-items: center; /* 垂直居中 */
  }
}
</style>
