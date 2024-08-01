<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { OpenAiLangChian } from '@/aigc/openai_langchian'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { OPENAI_API_KEY } from '@/constant'
import { ChatPromptTemplate } from '@langchain/core/prompts'
const prop = defineProps()
const openAi = new OpenAiLangChian({
  apiKey: OPENAI_API_KEY,
  modelType: 'gpt-3.5-turbo',
  needParser: true,
  baseUrl: 'https://apikeyplus.com/v1',
})
const systemTemplate = 'Translate the following into {language}:'
const promptTemplate = ChatPromptTemplate.fromMessages([
  ['system', systemTemplate],
  ['user', '{text}'],
])
onMounted(async () => {
  const messages = [
    new SystemMessage('Translate the following from English into Italian'),
    new HumanMessage('i love you!'),
  ]
  let res = await openAi.sendMsg(messages)
  const result = await promptTemplate.invoke({
    language: 'italian',
    text: 'hi',
  })
  console.log('返回的信息', res, result.toChatMessages())
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
