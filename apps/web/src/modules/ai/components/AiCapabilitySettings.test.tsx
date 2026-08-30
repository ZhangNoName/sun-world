import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  AiCapabilitySettings,
  type AiCapabilitySettingsProps,
} from './AiCapabilitySettings'

const persona = {
  id: 'persona-1',
  name: '研究员',
  description: '强调证据',
  instructions: '列出证据与限制。',
}

const skill = {
  id: 'skill-1',
  name: '风险清单',
  description: '补充风险',
  instructions: '最后列出主要风险。',
  kind: 'prompt' as const,
}

function renderSettings(overrides: Partial<AiCapabilitySettingsProps> = {}) {
  const props: AiCapabilitySettingsProps = {
    isAuthenticated: true,
    status: 'ready',
    error: null,
    personas: [persona],
    skills: [skill],
    selectedPersonaId: null,
    selectedSkillIds: [],
    onSelectPersona: vi.fn(),
    onToggleSkill: vi.fn(),
    onRefresh: vi.fn(),
    onSavePersona: vi.fn().mockResolvedValue(persona),
    onDeletePersona: vi.fn().mockResolvedValue(undefined),
    onSaveSkill: vi.fn().mockResolvedValue(skill),
    onDeleteSkill: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  render(<AiCapabilitySettings {...props} />)
  return props
}

describe('AiCapabilitySettings', () => {
  it('explains that capabilities require login while guest chat remains available', async () => {
    const user = userEvent.setup()
    renderSettings({
      isAuthenticated: false,
      status: 'guest',
      personas: [],
      skills: [],
    })

    await user.click(screen.getByRole('button', { name: /角色与 Skills 设置/ }))

    expect(screen.getByText('登录后保存你的角色与 Skills')).toBeInTheDocument()
    expect(screen.getByText(/当前仍可直接聊天/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去登录' })).toHaveAttribute(
      'href',
      '/login?return_to=%2Faigc'
    )
  })

  it('selects one persona and prompt-only skills', async () => {
    const user = userEvent.setup()
    const props = renderSettings()
    await user.click(screen.getByRole('button', { name: /角色与 Skills 设置/ }))

    const personaControl = screen.getByRole('radio', { name: /研究员/ })
    expect(personaControl).toHaveAttribute('data-slot', 'input')
    await user.click(personaControl)
    expect(props.onSelectPersona).toHaveBeenCalledWith('persona-1')

    await user.click(screen.getByRole('tab', { name: /Skills/ }))
    const skillControl = screen.getByRole('checkbox', { name: /风险清单/ })
    expect(skillControl).toHaveAttribute('data-slot', 'input')
    await user.click(skillControl)
    expect(props.onToggleSkill).toHaveBeenCalledWith('skill-1')
    expect(screen.getByText(/只保存声明式 Markdown 提示词/)).toBeInTheDocument()
  })

  it('runs the create, edit, and confirmed delete persona paths', async () => {
    const user = userEvent.setup()
    const props = renderSettings()
    await user.click(screen.getByRole('button', { name: /角色与 Skills 设置/ }))

    await user.click(screen.getByRole('button', { name: '新建角色' }))
    await user.type(screen.getByLabelText('名称'), '写作教练')
    await user.type(screen.getByLabelText('提示词指令'), '先给结构建议。')
    await user.click(screen.getByRole('button', { name: '保存角色' }))
    await waitFor(() =>
      expect(props.onSavePersona).toHaveBeenCalledWith({
        id: undefined,
        name: '写作教练',
        description: null,
        instructions: '先给结构建议。',
      })
    )

    await user.click(screen.getByRole('button', { name: '编辑角色 研究员' }))
    const name = screen.getByLabelText('名称')
    await user.clear(name)
    await user.type(name, '高级研究员')
    await user.click(screen.getByRole('button', { name: '保存角色' }))
    await waitFor(() =>
      expect(props.onSavePersona).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: 'persona-1',
          name: '高级研究员',
        })
      )
    )

    await user.click(screen.getByRole('button', { name: '删除角色 研究员' }))
    expect(screen.getByText(/删除后无法恢复/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() =>
      expect(props.onDeletePersona).toHaveBeenCalledWith('persona-1')
    )
  })

  it('always saves a Skill with fixed prompt kind and no executable fields', async () => {
    const user = userEvent.setup()
    const props = renderSettings()
    await user.click(screen.getByRole('button', { name: /角色与 Skills 设置/ }))
    await user.click(screen.getByRole('tab', { name: /Skills/ }))
    await user.click(screen.getByRole('button', { name: '新建 Skill' }))

    await user.type(screen.getByLabelText('名称'), '结论优先')
    await user.type(screen.getByLabelText('提示词指令'), '第一段先给结论。')
    expect(screen.queryByLabelText(/脚本|命令|工具/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存Skill' }))

    await waitFor(() =>
      expect(props.onSaveSkill).toHaveBeenCalledWith({
        id: undefined,
        name: '结论优先',
        description: null,
        instructions: '第一段先给结论。',
        kind: 'prompt',
      })
    )
  })
})
