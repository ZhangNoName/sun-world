<script lang="ts" setup>
import {
  ElDialog,
  ElIcon,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElUpload,
  UploadProps,
  UploadRequestHandler,
  UploadUserFile,
} from 'element-plus'
import { AddSvg } from '@sun-world/icons-vue'
import { computed } from 'vue'
import { reactive } from 'vue'
import { ref } from 'vue'
const RenderOptions = ['div', 'canvas']
const prop = defineProps({})
const tileConfig = reactive({
  row: 5,
  col: 5,
  width: 16,
  height: 16,
})
const renderType = ref('div')
const dialogImageUrl = ref('')
const dialogVisible = ref(false)
const fileList = ref<UploadUserFile[]>([
  {
    name: 'food.jpeg',
    url: 'https://fuss10.elemecdn.com/3/63/4e7f3a15429bfda99bce42a18cdd1jpeg.jpeg?imageMogr2/thumbnail/360x360/format/webp/quality/100',
  },
  {
    name: 'plant-1.png',
    url: '/images/plant-1.png',
  },
])
const canvasConfig = computed(() => {
  return {
    width: tileConfig.row * tileConfig.width,
    height: tileConfig.col * tileConfig.height,
  }
})

const handleRemove: UploadProps['onRemove'] = (uploadFile, uploadFiles) => {
  console.log(uploadFile, uploadFiles)
}
const handlePictureCardPreview: UploadProps['onPreview'] = (uploadFile) => {
  dialogImageUrl.value = uploadFile.url!
  dialogVisible.value = true
}
// 自定义上传请求
// 阻止上传，只有读取文件
const handleBeforeUpload = (file: File) => {
  // 读取文件
  readFile(file)
  // 返回 false，表示不上传文件
  return false
}
// 读取文件信息并生成图片预览
const readFile = (file: File) => {
  // 使用 FileReader 读取文件
  const reader = new FileReader()

  reader.onload = () => {
    // 生成一个 URL，方便 img 显示图片
    const fileUrl = reader.result as string
    fileList.value.push({
      name: file.name,
      size: file.size,
      // type: file.type,
      url: fileUrl, // 将文件的URL保存到 file.url
    })
  }

  reader.onerror = (error) => {
    console.error('Error reading file:', error)
  }

  reader.readAsDataURL(file) // 读取文件为 data URL
}
</script>

<template>
  <div class="game-tiles-page">
    <div>制作游戏需要的tiles</div>
    <div class="tiles-container">
      <div class="left">
        <div v-for="i in tileConfig.row" class="tile-row" key="`row-{i}`">
          <div
            v-for="j in tileConfig.col"
            :style="{
              width: tileConfig.width + 'px',
              height: tileConfig.height + 'px',
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
          <div class="label">导入已有tiles：</div>
          <ElUpload
            v-model:file-list="fileList"
            drag
            :on-preview="handlePictureCardPreview"
            :on-remove="handleRemove"
            :before-upload="handleBeforeUpload"
            list-type="picture-card"
          >
            <!-- c -->

            <AddSvg width="2.5rem" height="2.5rem" />

            <div class="upload-text">
              拖动文件到此处或者
              <em>点击</em>
              上传
            </div>
          </ElUpload>
          <ElDialog v-model="dialogVisible">
            <img w-full :src="dialogImageUrl" alt="Preview Image" />
          </ElDialog>
        </div>
        <div class="config-item"></div>
        <div class="config-item"></div>
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
      gap: 1rem;
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
      .el-upload-dragger {
        width: 100%;
        height: 100%;
      }
    }
  }
}
</style>
