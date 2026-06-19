<script lang="ts" setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ExportSvg, RobotSvg } from '@sun-world/icons'
import { SunButton } from '@sun-world/ui/button'
import { sendAiMessage } from '@/modules/ai/api'
import type { IMsg, ISession } from '@/types/ai.type'
import { MsgRole } from '@/types/ai.type'
import { getUUID } from '@/util/common'
import ChatInput from '@/modules/ai/ui/ChatInput.vue'
import ChatList from '@/modules/ai/ui/ChatList.vue'
import ConfigModal from '@/modules/ai/ui/ConfigModal.vue'
import ModelName from '@/modules/ai/ui/ModelName.vue'

const sidebarClass = ref<'expend' | 'hide'>('expend')
const isSending = ref(false)
const chatList = ref<IMsg[]>([])
const sessionList = ref<ISession[]>([
  {
    id: '1',
    name: '对话 1',
    description: '默认对话',
  },
  {
    id: '2',
    name: '对话 2',
    description: '备用对话',
  },
])
const currentSession = ref<string>('1')

const sendMsg = async (rawMessage: string) => {
  const message = rawMessage.trim()
  if (!message) {
    return ElMessage.error('请输入内容')
  }

  chatList.value.push({ id: getUUID(), role: MsgRole.USER, content: message })
  isSending.value = true

  try {
    const answer = await sendAiMessage(message, currentSession.value || '1')
    chatList.value.push({ id: getUUID(), role: MsgRole.AI, content: answer })
  } catch (error) {
    ElMessage.error('发送失败，请检查网络或稍后再试')
  } finally {
    isSending.value = false
  }
}

const selectSession = (id: string) => {
  currentSession.value = id
}
</script>

<template>
  <div class="aigc-container" :class="sidebarClass">
    <ChatList
      :list="sessionList"
      :id="currentSession"
      @select="selectSession"
    />

    <main class="main-content">
      <header class="chat-header">
        <ModelName model="gpt-3.5-t" />
        <div class="header-actions">
          <SunButton variant="icon" size="icon" title="导出聊天记录">
            <ExportSvg #icon width="1.4rem" height="1.4rem" />
          </SunButton>
          <ConfigModal />
        </div>
      </header>

      <div class="chat-body">
        <div
          v-for="(chat, index) in chatList"
          :key="index"
          :class="['message-row', chat.role]"
        >
          <div class="avatar">
            <RobotSvg
              v-if="chat.role === MsgRole.AI"
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

      <footer class="chat-footer">
        <ChatInput :loading="isSending" @send="sendMsg" />
      </footer>
    </main>
  </div>
</template>

<style scoped>
.aigc-container {
  display: flex;
  height: 100%;
  width: 100%;
  background-color: var(--color-surface-page);
  color: var(--color-text-primary);

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: var(--color-surface-page);
    color: var(--color-text-regular);
    position: relative;

    .chat-header {
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1.5rem 0 0.5rem;
      border-bottom: 1px solid var(--color-border-subtle);

      .model-name {
        font-weight: 600;
        font-size: var(--font-size-xl);

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
          background-color: var(--color-surface-muted);
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
            color: var(--btn-text-color);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: var(--font-size-xs);
          }
        }

        .message-content {
          flex: 1;
          font-size: var(--font-size-lg);
          white-space: pre-wrap;
        }
      }
    }

    .chat-footer {
      padding: 1rem 0 2rem;
      background: linear-gradient(transparent, var(--color-surface-page) 20%);
    }
  }
}

@media (max-width: 768px) {
  .chat-body .message-row {
    padding: 1.5rem 1rem;
  }
}
</style>
