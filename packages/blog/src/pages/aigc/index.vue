<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { OpenAiLangChian } from '@/aigc/openai_langchian'
import { OPENAI_API_KEY } from '@/constant'
import { ElMessage } from 'element-plus'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'
import { ExportSvg, RobotSvg } from '@sun-world/icons'
import ZBtn from '@/components/ZBtn/index.vue'
import ChannelCard from '@/components/ChannelCard/index.vue'
import { IMsg, MsgRole } from '@/types/ai.type'
import { getUUID } from '@/util/common'
import ChatInput from './config/chatInput.vue'
import ChatList from './side.vue'
import ConfigModal from './config/configModal.vue'
import ModelName from './config/modelName.vue'
const sidebarClass = ref<'expend' | 'hide'>('expend')
const userInput = ref('')
const chatList = ref<IMsg[]>([])
const SessionList = ref([])
const currentSession = ref(null)
const configModalVisible = ref(false)

const openAi = new OpenAiLangChian({
  apiKey: OPENAI_API_KEY,
  modelType: 'gpt-3.5-turbo',
  needParser: true,
  baseUrl: 'https://apikeyplus.com/v1',
})

const sendMsg = async () => {
  if (!userInput.value.trim()) {
    return ElMessage.error('请输入内容')
  }

  const msg = userInput.value
  chatList.value.push({ id: getUUID(), role: MsgRole.USER, content: msg })
  userInput.value = ''

  try {
    let res = await openAi.sendMsg({ text: msg })
    chatList.value.push({ id: getUUID(), role: MsgRole.AI, content: res })
  } catch (error) {
    ElMessage.error('发送失败，请检查网络或 API Key')
  }
}
</script>

<template>
  <div class="aigc-container" :class="sidebarClass">
    <!-- 侧边栏 -->
    <ChatList />

    <!-- 主内容区 -->
    <main class="main-content">
      <header class="chat-header">
        <model-name model="gpt-3.5-t" />
        <div class="header-actions">
          <ZBtn type="icon" size="icon" title="导出聊天记录">
            <ExportSvg #icon width="1.4rem" height="1.4rem" />
          </ZBtn>
          <config-modal />
        </div>
      </header>

      <!-- 聊天列表 -->
      <div class="chat-body">
        <div
          v-for="(chat, index) in chatList"
          :key="index"
          :class="['message-row', chat.role]"
        >
          <div class="avatar">
            <RobotSvg
              v-if="chat.role === 'ai'"
              width="2.4rem"
              height="2.4rem"
            />
            <div v-else class="user-avatar">U</div>
          </div>
          <div class="message-content">
            <div class="message-bubble">
              {{ chat.content }}
            </div>
          </div>
        </div>
      </div>

      <!-- 输入区域 -->
      <footer class="chat-footer">
        <chat-input />
      </footer>
    </main>
  </div>
  <!-- <config-modal v-model:visible="configModalVisible" /> -->
</template>

<style scoped>
.aigc-container {
  display: flex;
  height: 100%;
  width: 100%;
  background-color: #fff;
  color: #0d0d0d;

  /* 主内容区样式 */
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: #ffffff;
    color: #343541;
    position: relative;

    .chat-header {
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1.5rem 0 0.5rem;
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      .model-name {
        font-weight: 600;
        font-size: 18px;
        span {
          margin-right: var(--spacing);
          line-height: 28px;
        }
      }
      .header-actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }
    }

    .chat-body {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;

      .message-row {
        display: flex;
        padding: 1.5rem 20%;
        gap: 1.5rem;
        line-height: 1.6;

        &.ai {
          background-color: #f7f7f8;
        }

        .avatar {
          flex-shrink: 0;
          width: 30px;
          height: 30px;
          border-radius: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          .user-avatar {
            width: 100%;
            height: 100%;
            background: #ab68ff;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.8rem;
          }
        }

        .message-content {
          flex: 1;
          font-size: 1rem;
          white-space: pre-wrap;
        }
      }
    }

    .chat-footer {
      padding: 1rem 0 2rem;
      background: linear-gradient(transparent, #fff 20%);
    }
  }
}

/* 移动端适配或窄屏处理 */
@media (max-width: 768px) {
  .chat-body .message-row {
    padding: 1.5rem 1rem;
  }
}
</style>
