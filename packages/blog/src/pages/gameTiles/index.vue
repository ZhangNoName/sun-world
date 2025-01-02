<script lang="ts" setup>
import {
  ElButton,
  ElDialog,
  ElIcon,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElUpload,
  UploadFile,
  ElCheckboxGroup,
  ElCheckbox,
} from 'element-plus'
import { AddSvg } from '@sun-world/icons-vue'
import { Plus } from '@element-plus/icons-vue'
import { computed } from 'vue'
import { reactive } from 'vue'
import { ref } from 'vue'
import { onMounted } from 'vue'
import { watch } from 'vue'
import { saveTileImages, saveTilesAsZip } from '@/util/function'
interface ItemType {
  left: number
  top: number
  image: string
}
const RenderOptions = ['div', 'canvas']
const prop = defineProps({})
const fileList = ref<UploadFile[]>([])
const tiles = ref<ItemType[][]>([[]]) // 存储切割后的瓦片信息
const tileConfig = reactive({
  row: 20,
  col: 20,
  width: 16,
  height: 16,
  gap: 1,
})
const imageUrl = ref('')
const splitMode = ref('size')
const imageWidth = ref(0)
const imageHeight = ref(0)
const renderType = ref('div')
const dialogImageUrl = ref('')
const dialogVisible = ref(false)
const exportOptions = ref(['all'])
const canvasConfig = computed(() => {
  return {
    width: tileConfig.row * tileConfig.width,
    height: tileConfig.col * tileConfig.height,
  }
})

// 读取文件并切割为瓦片
const readFile = (file: any) => {
  const reader = new FileReader()
  reader.onload = (e: any) => {
    // console.log('读取文件,', e)
    const img = new Image()
    img.onload = () => {
      imageWidth.value = img.width
      imageHeight.value = img.height
      imageUrl.value = img.src
      splitImage()
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(file.raw)
}
const splitImage = () => {
  tiles.value = []
  if (!imageUrl.value) return

  for (let row = 0; row < tileConfig.row; row++) {
    const rowItem = []
    for (let col = 0; col < tileConfig.col; col++) {
      rowItem.push({
        left: col * tileConfig.width,
        top: row * tileConfig.height,
        image: imageUrl.value,
      })
    }
    tiles.value.push(rowItem)
  }
}

const exportImage = () => {
  // saveTileImages(tiles.value)
  saveTilesAsZip(tiles.value)
}

watch(
  [imageUrl, tileConfig],
  (newValue, oldValue) => {
    console.log('重新计算tiles', newValue, oldValue)

    for (let row = 0; row < tileConfig.row; row++) {
      if (!tiles.value[row]) {
        tiles.value[row] = []
      }
      for (let col = 0; col < tileConfig.col; col++) {
        // let top = row * tileConfig.height + tileConfig.gap * (row + 1)
        // let left = col * tileConfig.width + tileConfig.gap * (col + 1)
        let top = row * tileConfig.height
        let left = col * tileConfig.width
        let image = tiles.value[row][col]?.image || ''
        if (top >= imageHeight.value || left >= imageWidth.value) {
          tiles.value[row][col] = {
            left: 0,
            top: 0,
            image: '',
          }
        } else {
          tiles.value[row][col] = {
            left,
            top,
            image,
          }
        }
      }
    }
  },
  {
    immediate: true, // 默认为false，立即执行回调函数
    deep: true, // 默认为false，不监听对象内部属性
  }
)
onMounted(() => {
  console.log('mounted')
})
</script>

<template>
  <div class="game-tiles-page">
    <div>制作游戏需要的tiles</div>
    <div class="tiles-container">
      <div class="left" :style="{ gap: tileConfig.gap + 'px' }">
        <div
          v-for="(row, i) in tiles"
          class="tile-row"
          :style="{ gap: tileConfig.gap + 'px' }"
          :key="`row-${i}`"
        >
          <div
            v-for="(item, j) in row"
            :style="{
              width: tileConfig.width + 'px',
              height: tileConfig.height + 'px',
              // backgroundImage: `url(${imageUrl})`,
              backgroundImage: `url(${item.image})`,
              backgroundPosition: `-${item.left}px -${item.top}px`,
            }"
            class="tile-item tile-col"
            :key="`${i}-${j}`"
          ></div>
        </div>
      </div>
      <div class="right">
        <div class="config-item">
          <div class="label">渲染方式：</div>
          <div class="item">
            <ElSelect v-model="renderType" style="width: 10rem">
              <ElOption
                v-for="item in RenderOptions"
                :key="item"
                :label="item"
                :value="item"
              />
            </ElSelect>
          </div>
        </div>

        <div class="config-item">
          <div class="label">导入已有tiles：</div>
          <ElUpload
            v-model:file-list="fileList"
            drag
            :limit="1"
            :multiple="false"
            action=""
            :auto-upload="false"
            :onChange="readFile"
            list-type="picture-card"
          >
            <div class="upload-dragger">
              <el-icon><Plus /></el-icon>
              <!-- <AddSvg width="2.5rem" height="2.5rem" /> -->
              <div>拖动或点击上传</div>
            </div>
          </ElUpload>
          <ElDialog v-model="dialogVisible">
            <img w-full :src="dialogImageUrl" />
          </ElDialog>
        </div>
        <div class="config-item">
          <div class="label">画布大小：</div>
          <div class="item">
            <!-- <div>宽</div> -->
            <ElInputNumber v-model="tileConfig.row" :min="1" :max="100" />
            <div>×</div>
            <ElInputNumber v-model="tileConfig.col" :min="1" :max="100" />
            <div>
              {{ canvasConfig.width + 'px × ' + canvasConfig.height + 'px' }}
            </div>
          </div>
        </div>
        <div class="config-item">
          <div class="label">瓦片大小：</div>
          <div class="item">
            <!-- <div>宽</div> -->
            <ElInputNumber v-model="tileConfig.width" :min="10" :max="100" />
            <div>×</div>
            <ElInputNumber v-model="tileConfig.height" :min="10" :max="100" />
          </div>
        </div>
        <div class="config-item">
          <div class="label">瓦片间隔：</div>
          <div class="item">
            <ElInputNumber v-model="tileConfig.gap" :min="0" :max="100" />
          </div>
        </div>
        <div class="config-item">
          <div class="label">保存：</div>
          <div class="item">
            <ElCheckboxGroup v-model="exportOptions">
              <ElCheckbox label="整图" value="all" />
              <ElCheckbox label="区块" value="split" />
              <ElCheckbox label="瓦片json" value="json" />
            </ElCheckboxGroup>
            <ElButton type="primary" @click="exportImage">导出</ElButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.game-tiles-page {
  width: 100%;
  /* height: 100%; */
  height: calc(100vh - 37rem);

  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  .tiles-container {
    flex: auto;
    display: flex;
    gap: 1rem;
    overflow: auto;
    .left {
      max-width: 50%;
      max-height: 100%;
      padding: 1rem;
      flex: auto;
      background-color: beige;
      display: flex;
      flex-direction: column;
      overflow: auto;
      .tile-row {
        display: flex;
        gap: 0.5rem;
        .tile-item {
          flex: none;
          background-color: blanchedalmond;
        }
      }
    }
    .right {
      background-color: antiquewhite;
      width: 50%;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      justify-content: stretch;
      gap: 1rem;
      .config-item {
        display: flex;
        align-items: center;
        gap: 1rem;
        .item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
      }
    }
  }
}
</style>
