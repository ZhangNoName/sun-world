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
  Search,
  EditSvg,
  ExportSvg,
  FullScreenSvg,
  ClearSvg,
  RobotSvg,
} from '@sun-world/icons'
import ZBtn from '@/components/ZBtn/index.vue'
import ChannelCard from '@/components/ChannelCard/index.vue'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'
import router from '@/router'

const sidebarClass = ref<'expend' | 'hide'>('expend')
const userInput = ref('')
const chatList = ref([
  { role: 'ai', content: '你好！我是你的 AI 助手，有什么我可以帮你的吗？' },
  { role: 'user', content: '帮我写一个关于重构 UI 的计划。' },
  {
    role: 'ai',
    content:
      '没问题，重构 UI 通常包括以下几个步骤：\n1. 分析现有结构\n2. 定义视觉风格\n3. 优化交互流程\n4. 编写响应式代码。',
  },
])

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
  chatList.value.push({ role: 'user', content: msg })
  userInput.value = ''

  try {
    let res = await openAi.sendMsg({ text: msg })
    chatList.value.push({ role: 'ai', content: res })
  } catch (error) {
    ElMessage.error('发送失败，请检查网络或 API Key')
  }
}

const changeSidebar = () => {
  sidebarClass.value = sidebarClass.value === 'expend' ? 'hide' : 'expend'
}
const goHome = () => {
  router.push({ path: '/' })
}
const closeSidebar = () => {
  sidebarClass.value = 'hide'
}
</script>

<template>
  <div class="aigc-container" :class="sidebarClass">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <SvgIcon name="sidebar" @click="closeSidebar" />
      </div>
      <div class="menu">
        <div class="menu-item">
          <SvgIcon name="ai-add" />
          <span>新聊天</span>
        </div>
        <div class="menu-item">
          <SvgIcon name="search" />
          <span>搜索聊天</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-group">
          <div class="group-title" v-if="sidebarClass === 'expend'">
            你的聊天
          </div>
          <ChannelCard
            v-for="i in 3"
            :key="i"
            :id="String(i)"
            title="关于重构的讨论"
            dialogNum="12"
            createTime="刚刚"
          />
        </div>
      </nav>

      <div class="sidebar-footer">
        <ZBtn class="footer-item" type="text">
          <SettingSvg #icon width="1.4rem" height="1.4rem" color="#0d0d0d" />
          <span v-if="sidebarClass === 'expend'">设置</span>
        </ZBtn>
      </div>

      <div class="sidebar-drag" @click="changeSidebar">
        <DragSvg width="1.2rem" height="1.2rem" />
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <header class="chat-header">
        <div class="model-info">
          <span class="model-name">GPT-3.5 Turbo</span>
        </div>
        <div class="header-actions">
          <ZBtn :title="$t('export')">
            <ExportSvg #icon width="1.4rem" height="1.4rem" />
          </ZBtn>
          <ZBtn :title="$t('fullScreen')">
            <FullScreenSvg #icon width="1.4rem" height="1.4rem" />
          </ZBtn>
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
        <div class="input-container">
          <div class="input-wrapper">
            <textarea
              v-model="userInput"
              placeholder="发送消息..."
              @keydown.enter.exact.prevent="sendMsg"
              rows="1"
            ></textarea>
            <button
              class="send-btn"
              :disabled="!userInput.trim()"
              @click="sendMsg"
            >
              <AddSvg
                style="transform: rotate(45deg)"
                width="1.6rem"
                height="1.6rem"
              />
            </button>
          </div>
          <p class="footer-tip">AI 可能会产生错误信息，请核实重要内容。</p>
        </div>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.aigc-container {
  display: flex;
  height: 100%;
  width: 100%;
  background-color: #fff;
  color: #0d0d0d;
  /* 侧边栏样式 */
  .sidebar {
    position: relative;
    width: 260px;
    background-color: #f9f9f9;
    border-right: 1px solid #0d0d0d0d;
    display: flex;
    flex-direction: column;
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 10;
    padding: 6px 10px;

    .sidebar-header {
      padding: 0.8rem;
      display: flex;
      justify-content: flex-end;
      align-items: center;
    }
    .menu {
      .menu-item {
        display: flex;
        justify-content: flex-start;
        align-items: center;
      }
    }

    .sidebar-nav {
      flex: 1;
      overflow-y: auto;
      padding: 0.8rem;
      .group-title {
        font-size: 0.75rem;

        margin: 1rem 0.5rem 0.5rem;
      }
    }

    .sidebar-footer {
      padding: 0.8rem;
      border-top: 1px solid #4d4d4f;
      .footer-item {
        width: 100%;
        justify-content: flex-start;

        background: transparent;
      }
    }

    .sidebar-drag {
      position: absolute;
      right: -10px;
      top: 50%;
      transform: translateY(-50%);
      width: 20px;
      height: 40px;
      background: #202123;
      border: 1px solid #4d4d4f;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s;
    }
    &:hover .sidebar-drag {
      opacity: 1;
    }
  }

  &.hide .sidebar {
    width: 0;
    overflow: hidden;
  }

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
      padding: 0 1.5rem;
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      .model-name {
        font-weight: 600;
        font-size: 0.9rem;
      }
      .header-actions {
        display: flex;
        gap: 0.5rem;
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

      .input-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 0 1rem;

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: flex-end;
          background: #fff;
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 12px;
          box-shadow: 0 0 15px rgba(0, 0, 0, 0.05);
          padding: 0.7rem 1rem;

          textarea {
            flex: 1;
            border: none;
            outline: none;
            padding: 0.2rem 0;
            resize: none;
            max-height: 200px;
            font-family: inherit;
            font-size: 1rem;
          }

          .send-btn {
            background: #19c37d;
            color: #fff;
            border: none;
            border-radius: 6px;
            padding: 4px;
            cursor: pointer;
            transition: opacity 0.2s;
            &:disabled {
              background: #d9d9e3;
              cursor: not-allowed;
            }
          }
        }
        .footer-tip {
          text-align: center;
          font-size: 0.75rem;
          color: #8e8ea0;
          margin-top: 0.8rem;
        }
      }
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
