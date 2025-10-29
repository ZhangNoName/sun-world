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
import type { UploadProps } from 'element-plus'
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
interface TileInfo extends ItemType {
  index: number
  row: number
  col: number
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
const showTile = reactive<TileInfo>({
  top: 0,
  left: 0,
  row: 0,
  col: 0,
  image: '',
  index: 0,
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
/**
 * 清空画布
 */
const clearAllTiles = () => {
  // tiles.value = []
  imageUrl.value = ''
  fileList.value = []
  for (let row = 0; row < tileConfig.row; row++) {
    tiles.value[row] = []

    for (let col = 0; col < tileConfig.col; col++) {
      // let top = row * tileConfig.height + tileConfig.gap * (row + 1)
      // let left = col * tileConfig.width + tileConfig.gap * (col + 1)
      let top = row * tileConfig.height
      let left = col * tileConfig.width
      tiles.value[row][col] = {
        left,
        top,
        image: '',
      }
    }
  }
}
/**
 * 点击瓦片，在右侧显示详情
 * @param e 选中的瓦片
 */
const selectTiles = (event: MouseEvent) => {
  // 获取事件目标
  const target = event.target as HTMLElement

  // 检查点击的是否是 .tile-item
  if (target.classList.contains('tile-item')) {
    // 获取自定义属性 data-key 的值
    const key = target.getAttribute('data-key')
    if (key) {
      const [i, j] = key.split('-').map(Number) // 提取 i 和 j
      console.log('Selected Tile:', { i, j })
      // 这里可以执行你的逻辑，例如高亮选中的瓦片
      const tile = tiles.value[i][j]
      showTile.left = tile.left
      showTile.top = tile.top

      showTile.image = tile.image
    }
  }
}

const exportImage = () => {
  // saveTileImages(tiles.value)
  saveTilesAsZip(tiles.value)
}
const handlePictureCardPreview: UploadProps['onPreview'] = (uploadFile) => {
  dialogImageUrl.value = uploadFile.url!
  dialogVisible.value = true
}

/**
 * 重置瓦片
 */
const resetTile = () => {
  const { row, col } = showTile
  const tile = tiles.value[row][col]
  tile.top = 0
  tile.left = 0
  tile.image = ''
  // showTile.image = ''
}

/**
 * 重新计算tiles
 */
const recomputeTiles = () => {
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
}
watch(
  [imageUrl, tileConfig],
  (newValue, oldValue) => {
    // console.log('重新计算tiles', newValue, oldValue)
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
      <div
        class="left"
        :style="{ gap: tileConfig.gap + 'px' }"
        @click="selectTiles"
      >
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
            :title="`${i}-${j} ${i * tileConfig.row + j}`"
            class="tile-item tile-col"
            :key="`${i}-${j}`"
            :data-key="`${i}-${j}`"
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
            <ElButton type="danger" @click="clearAllTiles">清空画布</ElButton>
          </div>
        </div>

        <div class="config-item">
          <div class="label">导入已有tiles：</div>
          <ElUpload
            v-model:file-list="fileList"
            :max="1"
            drag
            :limit="1"
            :multiple="false"
            action=""
            :auto-upload="false"
            :onChange="readFile"
            list-type="picture-card"
            :on-preview="handlePictureCardPreview"
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
        <div class="config-item">
          <!-- <div class="label">单独设置：</div> -->
          <div class="item tile-item-config">
            <div class="config-left">
              <div class="item-image-container">
                <div
                  class="tile-item-image-show"
                  :style="{
                    width: tileConfig.width + 'px',
                    height: tileConfig.height + 'px',
                    backgroundImage: `url(${showTile.image})`,
                    // backgroundImage: `url(building.png)`,
                    backgroundPosition: `-${showTile.left}px -${showTile.top}px`,
                    // transform: `scale(${200 / tileConfig.width})`,
                  }"
                ></div>
              </div>
            </div>
            <div class="config-right">
              <div class="tile-info">
                <div>行：</div>
                <ElInputNumber v-model="showTile.row" :min="1" :max="100" />
                <div>列：</div>
                <ElInputNumber v-model="showTile.col" :min="1" :max="100" />
                <div>序号：</div>
                <ElInputNumber v-model="showTile.index" :min="1" :max="100" />
              </div>
              <div class="update-tile">
                <div class="upload-single-image">
                  <ElUpload
                    v-model:file-list="fileList"
                    :max="1"
                    drag
                    :limit="1"
                    :multiple="false"
                    action=""
                    :auto-upload="false"
                    :onChange="readFile"
                    list-type="picture-card"
                    :on-preview="handlePictureCardPreview"
                  >
                    <div class="upload-dragger">
                      <el-icon><Plus /></el-icon>
                      <div>拖动或点击上传</div>
                    </div>
                  </ElUpload>
                </div>
                <div class="item-footer">
                  <ElButton type="primary" @click="resetTile">替换</ElButton>
                  <ElButton type="primary" @click="resetTile">重置</ElButton>
                </div>
              </div>
            </div>
          </div>
          <div></div>
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
    gap: var(--horizontalGapPx);
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
          &:hover {
            scale: 1.3;
            outline: 2px solid red;
          }
        }
      }
    }
    .right {
      background-color: antiquewhite;
      width: 50%;
      overflow: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      justify-content: stretch;
      gap: var(--horizontalGapPx);
      .config-item {
        display: flex;
        align-items: center;
        gap: var(--horizontalGapPx);
        .item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .tile-item-config {
          display: flex;
          height: 20rem;
          gap: var(--horizontalGapPx);
          /* background-color: black; */
          .config-left {
            .item-image-container {
              height: 200px;
              width: 200px;
              display: flex;
              justify-content: center;
              align-items: center;
              border: 1px solid red;
              /* border-radius: 1rem; */
              .tile-item-image-show {
                /* background-color: red; */
                background-repeat: no-repeat;
              }
            }
          }
          .config-right {
            height: 100%;
            display: flex;
            flex-direction: column;
            /* justify-content: space-between; */
            gap: var(--horizontalGapPx);
            .tile-info {
              display: flex;
              align-items: center;
              gap: var(--horizontalGapPx);
            }
            .update-tile {
              flex: auto;
              display: flex;
              flex-direction: row;
              justify-content: space-between;
              .upload-single-image {
              }
              .item-footer {
                display: flex;
                /* justify-content: flex-end; */
                gap: var(--horizontalGapPx);
                justify-self: flex-end;
              }
            }
          }
        }
      }
    }
  }
}
</style>
