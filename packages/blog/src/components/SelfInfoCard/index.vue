<script lang="ts" setup>
  import { onBeforeUnmount, onMounted, ref } from 'vue'
  import {
    WeChatOutLined,
    QQOutlined,
    GithubOutlined,
  } from '@sun-world/icons-vue'
  import { openGithub } from '@/util'

  const prop = defineProps()
  const blogNum = ref(0)
  const seriesNum = ref(0)
  const tagNum = ref(0)
  const commentNum = ref(0)
  const viewsNum = ref(0)
  const time = ref('')
  const timerRef = ref()
  const getCurrentTime = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = ('0' + (now.getMonth() + 1)).slice(-2)
    const day = ('0' + now.getDate()).slice(-2)
    const hours = ('0' + now.getHours()).slice(-2)
    const minutes = ('0' + now.getMinutes()).slice(-2)
    const seconds = ('0' + now.getSeconds()).slice(-2)
    return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`
  }

  const updateTime = () => {
    time.value = getCurrentTime()
    timerRef.value = requestAnimationFrame(updateTime)
  }

  onMounted(() => {
    timerRef.value = requestAnimationFrame(updateTime)
  })
  onBeforeUnmount(() => {
    cancelAnimationFrame(timerRef.value)
  })
</script>

<template>
  <div class="self-card">
    <div class="weather"></div>
    <div class="adress">{{ time }}</div>
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
    grid-template-rows: 1fr 2.5rem 6rem 3rem 1rem 3rem;

    gap: 1.5rem;
    background-color: var(--blog-card-bg-color);

    .weather {
      background-color: pink;
    }
    .adress {
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
