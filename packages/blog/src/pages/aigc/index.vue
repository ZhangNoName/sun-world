<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { OpenAiLangChian } from '@/aigc/openai_langchian'
import { OPENAI_API_KEY } from '@/constant'
import { ElMessage } from 'element-plus'
import {
  AIGCSvg,
  CharacterSvg,
  DiscoverSvg,
  DragSvg,
  AddSvg,
  SettingSvg,
} from '@sun-world/icons-vue'
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
        <ZBtn fontSize="1.2rem">
          <CharacterSvg
            #icon
            color="rgb(51,51,51)"
            width="1.6rem"
            height="1.6rem"
          />
          面具
        </ZBtn>
        <ZBtn fontSize="1.2rem">
          <DiscoverSvg
            #icon
            color="rgb(51,51,51)"
            width="1.6rem"
            height="1.6rem"
          />
          发现
        </ZBtn>
      </div>
      <div class="body"></div>
      <div class="tail">
        <ZBtn>
          <SettingSvg
            #icon
            color="rgb(51,51,51)"
            width="1.6rem"
            height="1.6rem"
          />
        </ZBtn>
        <ZBtn fontSize="1.2rem">
          <AddSvg #icon color="rgb(51,51,51)" width="1.6rem" height="1.6rem" />

          新的聊天
        </ZBtn>
      </div>
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
  border: 1px solid var(--border-color);
  border-radius: 2rem;
  overflow: hidden;
  box-shadow: var(--aigc-box-shadow);
  .sidebar {
    position: relative;
    gap: 1.5rem;
    background-color: var(--bg-color-0);
    padding: 2rem;
    display: flex;
    flex-direction: column;
    box-shadow: var(--aigc-box-shadow);
    .header {
      position: relative;
      padding-top: 2rem;
      padding-bottom: 2rem;
      text-align: left;
      .title {
        font-size: 2rem;
        font-weight: 700;
        animation: all 0.3s ease;
        color: var(--font-color-0);
      }
      .des {
        font-size: 1.2rem;
        font-weight: 400;
        animation: all 0.3s ease;
        color: var(--font-color-2);
      }
      .logo {
        position: absolute;
        right: 0;
        bottom: 1.8rem;
        opacity: 0.27;
      }
    }
    .func {
      display: flex;
      justify-content: space-around;
      align-items: center;
      gap: 1rem;
      .sun-btn {
        flex-grow: 1;
      }
    }
    .body {
      flex: auto;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .tail {
      padding-top: 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
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
        background-color: var(--bg-color-1);
        // content: ;
      }
    }
  }
  .right {
    // background-color: blue;
  }
}
</style>
