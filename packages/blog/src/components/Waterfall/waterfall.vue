<template>
  <div
    ref="containerRef"
    class="waterfall-container"
    :style="{ gap: props.gap + 'px' }"
  >
    <div
      v-for="(col, colIndex) in columns"
      :key="colIndex"
      class="waterfall-column"
      :style="{ width: columnWidth + 'px', gap: props.gap + 'px' }"
    >
      <div
        v-for="(item, index) in col"
        :key="item.id || index"
        class="waterfall-item"
      >
        <img
          v-lazy="item.cover_url"
          :alt="item.title"
          :style="{ width: '100%' }"
        />

        <div class="waterfall-info">
          <p class="waterfall-title">{{ item.title }}</p>

          <div class="waterfall-meta">
            <span class="waterfall-author">{{ item.author }}</span>
            <span class="waterfall-likes">
              <svg
                class="like-icon"
                viewBox="0 0 1024 1024"
                width="1em"
                height="1em"
              >
                <path
                  d="M512 878.08c-52.8-51.2-125.44-118.72-192-184.32-66.56-65.6-130.56-128-175.36-180.48-64-75.52-96.64-162.56-96.64-250.88C48 136.32 165.76 48 312.32 48c89.6 0 174.08 43.52 250.24 121.6 76.16-78.08 160.64-121.6 250.24-121.6 146.56 0 264.32 88.32 264.32 194.56 0 88.32-32.64 175.36-96.64 250.88-44.8 52.48-108.8 114.88-175.36 180.48-66.56 65.6-139.2 133.12-192 184.32zM512 809.6c43.52-42.88 111.36-107.52 176.64-171.2 65.28-63.68 126.72-124.8 171.84-177.6 57.6-67.2 86.4-148.8 86.4-233.6 0-104.96-78.72-177.6-191.04-177.6-67.84 0-131.2 32-177.92 84.8-46.72-52.8-110.08-84.8-177.92-84.8-112.32 0-191.04 72.64-191.04 177.6 0 84.8 28.8 166.4 86.4 233.6 45.12 52.8 106.56 113.92 171.84 177.6 65.28 63.68 133.12 128.32 176.64 171.2z"
                  fill="currentColor"
                ></path>
              </svg>
              {{
                item.likes >= 10000
                  ? (item.likes / 10000).toFixed(1) + 'w'
                  : item.likes
              }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch } from 'vue'
// 假设 WaterfallItem 接口和 TestList 已经定义并导出
import { TestList, WaterfallItem } from './test'

// ... Props 定义保持不变

interface Props {
  list?: WaterfallItem[]
  columnCount?: number
  gap?: number
}

const props = withDefaults(defineProps<Props>(), {
  columnCount: 2,
  gap: 12,
  list: () => TestList,
})

const containerRef = ref<HTMLElement>()
const columns = reactive<WaterfallItem[][]>([])
const columnWidth = ref(0)

// 计算布局
function renderWaterfall() {
  if (!containerRef.value) return

  const containerWidth = containerRef.value.clientWidth
  // 计算每列的宽度 (总宽 - 总间隙) / 列数
  columnWidth.value =
    (containerWidth - props.gap * (props.columnCount - 1)) / props.columnCount

  // 1. 初始化每列高度和数据
  const heights = Array(props.columnCount).fill(0)
  columns.splice(
    0,
    columns.length,
    ...Array(props.columnCount)
      .fill(null) // 确保用 null 或 undefined 填充，避免 Array.fill 引用同一个数组
      .map(() => [])
  )

  // 2. 遍历列表，将每个 item 放入当前最短的那一列
  props.list.forEach((item) => {
    // 找到高度最短的列的索引
    const minIndex = heights.indexOf(Math.min(...heights))

    // ⭐ 关键优化：根据宽高比和当前列宽，计算 item 的【实际渲染高度】
    // 渲染高度 = 列宽 / 宽高比 (W/H)
    // 如果 item.aspect_ratio 不存在或为 0，给一个安全默认值 (例如 1:1)
    const ratio =
      item.aspect_ratio && item.aspect_ratio > 0 ? item.aspect_ratio : 1
    const renderedImageHeight = columnWidth.value / ratio

    // 假设卡片信息区有一个固定的高度（例如 50px）
    const infoHeight = 50

    // 计算整个卡片的高度 (图片高度 + 信息区高度 + 上下边距/padding)
    const cardHeight = renderedImageHeight + infoHeight + 10

    // 3. 将 item 放入最短列，并更新该列的高度
    columns[minIndex].push(item)
    // 新高度 = 原高度 + 卡片高度 + 列内的 gap
    heights[minIndex] += cardHeight + props.gap
  })
}

// 监听窗口变化
onMounted(() => {
  renderWaterfall()
  window.addEventListener('resize', renderWaterfall)
})

onBeforeUnmount(() => window.removeEventListener('resize', renderWaterfall))

// 监听列表变化 (不需要 deep: true，因为我们只关心 list 引用是否变化)
watch(
  () => props.list,
  () => renderWaterfall()
)
</script>

<style scoped>
.waterfall-container {
  display: flex;
  /* 间距通过 props.gap 设置，在 template 中动态绑定 */
  align-items: flex-start;
  width: 100%;
}

.waterfall-column {
  display: flex;
  flex-direction: column;
  /* 列内的 item 间距通过 props.gap 设置，在 template 中动态绑定 */
}

.waterfall-item {
  /* 小红书卡片样式 */
  background-color: #fff;
  border-radius: 10px; /* 圆角 */
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); /* 轻微阴影 */
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.waterfall-item:hover {
  transform: translateY(-4px); /* 悬停上浮效果 */
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15); /* 悬停阴影加重 */
}

.waterfall-item img {
  display: block;
  /* 图片圆角与卡片顶部圆角一致 */
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
}

.waterfall-info {
  padding: 8px; /* 增加内边距 */
}

.waterfall-title {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  /* 限制两行文字，超出显示省略号 */
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
  margin-bottom: 6px;
}

.waterfall-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #999;
}

.waterfall-author {
  max-width: 60%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.waterfall-likes {
  display: flex;
  align-items: center;
}

.like-icon {
  width: 1em;
  height: 1em;
  margin-right: 4px;
  color: #c0c0c0; /* 灰色爱心 */
}
</style>
