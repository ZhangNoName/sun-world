<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { OpenAiLangChian } from '@/aigc/openai_langchian'
import { OPENAI_API_KEY } from '@/constant'
import { ElMessage } from 'element-plus'
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
    <div class="left"></div>
    <div class="right"></div>
  </div>
</template>

<style lang="scss" scoped>
.aigc-content {
  display: grid;
  grid-template-columns: 35rem auto;
  grid-template-rows: auto;
  gap: 1rem;
  .left {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .right {
    // background-color: blue;
  }
}
</style>
