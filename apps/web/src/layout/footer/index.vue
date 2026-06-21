<script setup lang="ts" name="ZFooter">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 网站开始运行的时间
const startDate = new Date('2024-07-17T00:00:00')

// 运行时间
const runningTime = ref({
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
})

// 访问统计
const visitors = ref(0)
const views = ref(0)

// 计算运行时间
function calculateRunningTime() {
  const now = new Date()
  const diff = now.getTime() - startDate.getTime()

  runningTime.value.days = Math.floor(diff / (1000 * 60 * 60 * 24))
  runningTime.value.hours = Math.floor(
    (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  )
  runningTime.value.minutes = Math.floor(
    (diff % (1000 * 60 * 60)) / (1000 * 60)
  )
  runningTime.value.seconds = Math.floor((diff % (1000 * 60)) / 1000)
}

// 初始化访问统计
function initStatistics() {
  // 从 localStorage 读取访问统计
  const storedVisitors = localStorage.getItem('site_visitors')
  const storedViews = localStorage.getItem('site_views')

  if (storedVisitors) {
    visitors.value = parseInt(storedVisitors, 10)
  } else {
    visitors.value = 1
    localStorage.setItem('site_visitors', '1')
  }

  if (storedViews) {
    views.value = parseInt(storedViews, 10)
  } else {
    views.value = 1
    localStorage.setItem('site_views', '1')
  }

  // 检查是否是新的访问者（使用 sessionStorage）
  const sessionVisited = sessionStorage.getItem('session_visited')
  if (!sessionVisited) {
    // 新访问者，增加访问人数
    visitors.value += 1
    localStorage.setItem('site_visitors', visitors.value.toString())
    sessionStorage.setItem('session_visited', 'true')
  }

  // 每次页面加载都增加访问量
  views.value += 1
  localStorage.setItem('site_views', views.value.toString())
}

let timer: number | null = null

onMounted(() => {
  calculateRunningTime()
  initStatistics()

  // 每秒更新运行时间
  timer = window.setInterval(() => {
    calculateRunningTime()
  }, 1000)
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
  }
})

// 格式化日期显示
const formattedStartDate = computed(() => {
  return startDate.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
})
</script>

<template>
  <div class="z-footer">
    <div class="z-footer-content">
      <div class="left">
        <div class="web-name text-large">{{ $t('footer.webName') }}</div>
        <span class="copyright text-small">
          {{ $t('footer.copyright') }}
        </span>
        <span class="text-small">
          {{ $t('footer.runningSince') }}
          <strong>{{ formattedStartDate }}</strong>
          {{ $t('footer.runningTime') }}
          <strong>{{ runningTime.days }}</strong>
          {{ $t('footer.day') }}
          <strong>{{ runningTime.hours }}</strong>
          {{ $t('footer.hour') }}
          <strong>{{ runningTime.minutes }}</strong>
          {{ $t('footer.minute') }}
          <strong>{{ runningTime.seconds }}</strong>
          {{ $t('footer.second') }}
        </span>

        <div class="text-small">
          <span>{{ $t('footer.visitors') }}：&nbsp;</span>
          <strong>{{ visitors }}</strong>
          <span>&nbsp;，{{ $t('footer.views') }}：</span>
          <strong>{{ views }}</strong>
        </div>
      </div>
      <div class="right">
        <div class="logo"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.z-footer {
  background-color: var(--bg-brand-light);
  /* height: 20rem; */
  width: 100%;
  padding: 3rem 0 6rem 0;
  margin-top: 1.5rem;
  bottom: 0;

  .z-footer-content {
    margin: 0 auto;
    height: 100%;
    width: 85%;
    /* background-color: aquamarine; */
    /* border: 2px solid red; */
    display: grid;
    grid-template-columns: 70% 30%;
    grid-template-rows: auto;

    .left {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: flex-start;
      padding: 1.5rem 2.5rem;
      gap: 0.5rem;

      span {
        text-align: left;
      }
      .web-name {
        height: 2.4rem;

        font-weight: 400;
      }
      .copyright {
        width: 80%;
      }
    }
    .right {
      display: flex;
      justify-content: center;
      align-items: center;
      .logo {
        height: 80%;
        aspect-ratio: 1 / 1;
        background-image: url(/logo.svg);
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
      }
    }
  }
}
</style>
