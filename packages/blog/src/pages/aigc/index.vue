<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { OpenAiLangChian } from '@/aigc/openai_langchian'
import { OPENAI_API_KEY } from '@/constant'
import { ElMessage } from 'element-plus'
import { AIGCSvg, DragSvg } from '@sun-world/icons-vue'
import ZBtn from '@/components/ZBtn/index.vue'
const prop = defineProps()
const openAi = new OpenAiLangChian({
  apiKey: OPENAI_API_KEY,
  modelType: 'gpt-3.5-turbo',
  needParser: true,
  baseUrl: 'https://apikeyplus.com/v1',
})

const sendMsg = async (msg: string) => {
  if (!msg) {
    ElMessage.error('请输入内容')
  }
  let res = await openAi.sendMsg({
    text: msg,
  })

  console.log('返回的信息', res)
}
onMounted(async () => {
  // sendMsg()
  // langSmith()
})
</script>

<template>
  <div class="aigc-content">
    <div class="sidebar">
      <div class="header">
        <div class="title">NextChat</div>
        <div class="des">Build your own AI assistant.</div>
        <div class="logo"><AIGCSvg width="5rem" height="5rem" /></div>
      </div>
      <div class="func">
        <ZBtn>
          <DragSvg #icon width="1.4rem" height="1.4rem" />
          123456
        </ZBtn>
      </div>
      <div class="body"></div>
      <div class="tail"></div>
      <div class="drag">
        <DragSvg width="1.4rem" height="1.4rem" />
      </div>
    </div>
    <div class="right"></div>
  </div>
</template>

<style lang="scss" scoped>
.aigc-content {
  display: grid;
  grid-template-columns: 30rem auto;
  grid-template-rows: auto;
  gap: 1rem;
  height: 75rem;
  margin: 5rem 0 2rem 0;
  border: 1px solid var(--blog-card-border-color);
  border-radius: 2rem;
  overflow: hidden;
  box-shadow: var(--aigc-box-shadow);
  .sidebar {
    position: relative;
    gap: 1.5rem;
    background-color: var(--aigc-left-bg-color);
    padding: 2rem;
    display: flex;
    flex-direction: column;
    .header {
      position: relative;
      padding-top: 2rem;
      padding-bottom: 2rem;
      text-align: left;
      .title {
        font-size: 2rem;
        font-weight: 700;
        animation: all 0.3s ease;
      }
      .des {
        font-size: 1.2rem;
        font-weight: 400;
        animation: all 0.3s ease;
      }
      .logo {
        position: absolute;
        right: 0;
        bottom: 1.8rem;
        opacity: 0.27;
      }
    }
    .func {
    }
    .body {
    }
    .tail {
    }
    .drag {
      position: absolute;
      top: 0;
      right: 0;
      height: 100%;
      width: 1.4rem;
      background-color: transparent;
      cursor: ew-resize;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      opacity: 0.5;
      &:hover {
        // background-color: black;
        // content: ;
      }
    }
  }
  .right {
    // background-color: blue;
  }
}
</style>
