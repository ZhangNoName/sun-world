<script lang="ts" setup>
import { ref, computed } from 'vue'
import ZBtn from '@/components/ZBtn/index.vue'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'
import { AddSvg, RobotSvg } from '@sun-world/icons' // 假设这些图标已存在，或使用文字替代

const props = defineProps<{
  loading?: boolean
}>()

const emit = defineEmits(['send', 'upload', 'voice'])

const content = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// 自动调整高度
const handleInput = (e: Event) => {
  const target = e.target as HTMLTextAreaElement
  target.style.height = 'auto'
  target.style.height = target.scrollHeight + 'px'
  content.value = target.value
}

const handleSend = () => {
  if (!content.value.trim() || props.loading) return
  emit('send', content.value)
  content.value = ''
  if (textareaRef.value) textareaRef.value.style.height = 'auto'
}
</script>

<template>
  <div class="gemini-input-container">
    <div class="input-card">
      <!-- 上方：输入区域 -->
      <div class="text-area-section">
        <textarea
          ref="textareaRef"
          v-model="content"
          class="gemini-textarea scroll"
          placeholder="给 AI 发送消息..."
          rows="1"
          @input="handleInput"
          @keydown.enter.exact.prevent="handleSend"
        ></textarea>
      </div>

      <!-- 下方：工具栏 -->
      <div class="bottom-toolbar">
        <div class="left-actions">
          <z-btn
            type="icon"
            size="icon"
            title="上传文件"
            @click="emit('upload')"
          >
            <SvgIcon name="ai-add" />
          </z-btn>
          <z-btn
            type="icon"
            size="icon"
            title="语音输入"
            @click="emit('voice')"
          >
            <SvgIcon name="ai-voice" />
          </z-btn>
        </div>

        <div class="right-actions">
          <z-btn
            type="icon"
            size="icon"
            class="send-btn"
            @click="handleSend"
            :disabled="content.length === 0 || loading"
          >
            <SvgIcon name="ai-send" size="large" color="var(--color-primary)" />
          </z-btn>
        </div>
      </div>
    </div>
    <p class="disclaimer">AI 可能会显示不准确的信息，请验证其回答。</p>
  </div>
</template>

<style scoped>
.gemini-input-container {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
  font-family: var(--font-family, sans-serif);

  .input-card {
    background: #f0f4f9;
    border-radius: 28px;
    padding: 0.8rem 1.2rem;
    transition: background-color 0.2s, box-shadow 0.2s;
    border: 1px solid transparent;

    &:focus-within {
      background: #fff;
      box-shadow: 0 1px 6px rgba(32, 33, 36, 0.28);
      border-color: #dee1e5;
    }

    .text-area-section {
      padding: 0.5rem 0;

      .gemini-textarea {
        width: 100%;
        border: none;
        outline: none;
        background: transparent;
        font-size: 1.1rem;
        line-height: 1.5;
        color: #1f1f1f;
        resize: none;
        max-height: 200px;
        padding: 0;
        display: block;

        &::placeholder {
          color: #757575;
        }
      }
    }

    .bottom-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 0.5rem;

      .left-actions {
        display: flex;
        gap: 0.5rem;
      }

      .send-btn {
        background: #e3e3e3;
        color: #9e9e9e;
        border: none;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;

        transition: all 0.2s;

        &.is-active {
          background: #1a73e8;
          color: #fff;
          cursor: pointer;

          &:hover {
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          }
        }

        &.is-loading {
          background: #f0f4f9;
          cursor: wait;
        }

        .send-icon {
          font-size: 1.4rem;
          font-weight: bold;
        }
      }
    }
  }

  .disclaimer {
    font-size: 0.75rem;
    color: #444746;
    text-align: center;
    margin-top: 0.8rem;
  }
}

/* Loading 动画 */
.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #1a73e8;
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
