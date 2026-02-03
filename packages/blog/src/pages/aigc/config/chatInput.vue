<script setup lang="ts">
import { ref, onInput } from 'vue'

const content = ref('')
const isMultiline = ref(false)

const handleInput = (e: Event) => {
  const target = e.target as HTMLElement
  content.value = target.innerText

  // 逻辑判断：如果内容高度超过一行（比如 24px），则触发换行模式
  // 也可以根据字符长度判断，但高度判断最准确
  if (target.scrollHeight > 32) {
    isMultiline.value = true
  } else {
    isMultiline.value = false
  }
}
</script>

<template>
  <div class="chat-container">
    <div class="input-wrapper" :class="{ 'is-multiline': isMultiline }">
      <div
        class="text-editor"
        contenteditable="true"
        placeholder="输入内容..."
        @input="handleInput"
      ></div>

      <div class="actions">
        <button class="send-btn" :class="{ active: content.length > 0 }">
          <span class="icon">↑</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-wrapper {
  display: flex;
  /* 关键：水平排列，且允许换行 */
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-end;
  background: #f4f4f4;
  border-radius: 24px;
  padding: 8px 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  gap: 8px;
}

.text-editor {
  flex: 1; /* 初始占据剩余空间 */
  min-width: 100px;
  min-height: 24px;
  max-height: 200px;
  outline: none;
  overflow-y: auto;
  font-size: 16px;
  line-height: 1.5;
  padding: 4px;
}

/* 🌟 当变为多行时的样式转换 */
.input-wrapper.is-multiline {
  flex-direction: column-reverse; /* 按钮移到下面，输入框顶到上面 */
  align-items: stretch;
}

.input-wrapper.is-multiline .text-editor {
  width: 100%; /* 强制占据整行 */
  flex: none;
}

.actions {
  display: flex;
  justify-content: flex-end; /* 按钮靠右 */
  padding-bottom: 2px;
}

.send-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: #ccc;
  color: white;
  cursor: pointer;
  transition: background 0.2s;
}

.send-btn.active {
  background: #000;
}

/* 占位符处理 */
.text-editor:empty:before {
  content: attr(placeholder);
  color: #999;
}
</style>
