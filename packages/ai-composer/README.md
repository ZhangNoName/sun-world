# @sun-world/ai-composer

Codex 风格的受控 React 输入框。包本身只负责交互与结构化提交，不依赖具体 AI 服务或上传接口。

## 能力

- 始终编辑 Markdown 源文本，渲染由宿主消息界面负责
- 输入聚焦时不改变输入框边框、阴影或背景
- 附件暂存在浏览器内存中，仅随 `submit` 交给宿主上传
- 受控模型选择和可搜索的 `/` 命令面板
- 独立的浏览器语音适配器、权限检查与可替换语音接口
- 加载时把发送按钮切换为取消按钮
- `focus`、`setQuestion`、`submit`、`cancel`、`reset` 命令式 API

## 使用

```tsx
import { useRef, useState } from 'react'
import {
  AiComposer,
  type AiComposerHandle,
  type AiComposerSubmitPayload,
} from '@sun-world/ai-composer'

function ChatInput() {
  const composer = useRef<AiComposerHandle>(null)
  const [value, setValue] = useState('')
  const [modelId, setModelId] = useState('deepseek-chat')

  async function send(payload: AiComposerSubmitPayload) {
    // 在这里上传 payload.files，再发送 payload.markdown、modelId 和 commandId。
  }

  return (
    <AiComposer
      ref={composer}
      value={value}
      onValueChange={setValue}
      models={[{ id: 'deepseek-chat', label: 'DeepSeek Chat' }]}
      modelId={modelId}
      onModelChange={setModelId}
      commands={[{ id: 'summarize', label: '总结内容' }]}
      onSubmit={send}
      onCancel={() => abortController.abort()}
    />
  )
}
```

`onSubmit` 成功后组件会清空正文、附件与命令；失败时会保留内容。宿主若需要显示可公开的错误信息，可抛出 `AiComposerSubmitError`，其他错误统一显示通用提示。

## 语音模块

默认适配器基于浏览器 `SpeechRecognition`/`webkitSpeechRecognition`，并在可用时通过 Permissions API 检查麦克风权限。宿主可用 `speechAdapter` 注入其他浏览器实现或自有语音服务；组件不会把录音或识别逻辑耦合到提交接口。

## 验证

```bash
corepack pnpm -C packages/ai-composer test
corepack pnpm -C packages/ai-composer build
```
