import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setLocale } from '@/i18n'
import {
  createAdminAiProvider,
  deleteAdminAiProvider,
  fetchAdminAiProviders,
  updateAdminAiProvider,
} from '../api'
import type { AdminAiProvider } from '../types'
import ManageProvidersDataPage from './ManageProvidersDataPage'

vi.mock('../api', () => ({
  createAdminAiProvider: vi.fn(),
  deleteAdminAiProvider: vi.fn(),
  fetchAdminAiProviders: vi.fn(),
  updateAdminAiProvider: vi.fn(),
}))

const qwen: AdminAiProvider = {
  id: 'qwen38-27b',
  name: 'Qwen Public',
  default_base_url: 'http://models.example.test:6195/v1',
  default_model: 'qwen38_27b',
  auth_mode: 'none',
  is_enabled: true,
  is_default: true,
  sort_order: 0,
  has_api_key: false,
  updated_at: '2026-08-30T00:00:00Z',
}

const bearer: AdminAiProvider = {
  id: 'team-chat',
  name: 'Team Chat',
  default_base_url: 'https://models.example.test/v1',
  default_model: 'team-chat',
  auth_mode: 'bearer',
  is_enabled: true,
  is_default: false,
  sort_order: 10,
  has_api_key: true,
  api_key_hint: 'sk-••••1234',
  updated_at: '2026-08-30T00:00:00Z',
}

describe('ManageProvidersDataPage model management', () => {
  const fetchModels = vi.mocked(fetchAdminAiProviders)
  const createModel = vi.mocked(createAdminAiProvider)
  const updateModel = vi.mocked(updateAdminAiProvider)
  const deleteModel = vi.mocked(deleteAdminAiProvider)

  beforeEach(async () => {
    await setLocale('zh')
    fetchModels.mockReset().mockResolvedValue([qwen, bearer])
    createModel.mockReset().mockResolvedValue(qwen)
    updateModel.mockReset().mockImplementation(async (_id, input) => ({
      ...bearer,
      ...input,
      has_api_key: bearer.has_api_key,
    }))
    deleteModel.mockReset().mockResolvedValue(undefined)
  })

  it('shows auth, credential, default, and protected model actions', async () => {
    const user = userEvent.setup()
    render(<ManageProvidersDataPage />)

    expect(await screen.findByText('Qwen Public')).toBeInTheDocument()
    expect(screen.getByText('无需密钥')).toBeInTheDocument()
    expect(screen.getByText('sk-••••1234')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '停用 Qwen Public' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: '删除 Qwen Public' })
    ).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '停用 Team Chat' }))
    await waitFor(() =>
      expect(updateModel).toHaveBeenCalledWith(
        'team-chat',
        expect.objectContaining({ is_enabled: false, is_default: false })
      )
    )
    updateModel.mockClear()

    await user.click(screen.getByRole('button', { name: '设为默认 Team Chat' }))
    await waitFor(() =>
      expect(updateModel).toHaveBeenCalledWith(
        'team-chat',
        expect.objectContaining({ is_default: true, is_enabled: true })
      )
    )
  })

  it('creates an unauthenticated public model and keeps defaults enabled', async () => {
    const user = userEvent.setup()
    render(<ManageProvidersDataPage />)
    await screen.findByText('Qwen Public')

    await user.click(screen.getByRole('button', { name: '新建模型' }))
    await user.type(screen.getByLabelText('模型 ID'), 'public-chat')
    await user.type(screen.getByLabelText('显示名称'), 'Public Chat')
    await user.type(
      screen.getByLabelText('基础 URL'),
      'http://models.example.test:6195/v1'
    )
    await user.type(screen.getByLabelText('模型'), 'public_chat')
    fireEvent.click(screen.getByRole('checkbox', { name: '设为默认模型' }))
    await user.click(screen.getByRole('button', { name: '创建模型' }))

    await waitFor(() =>
      expect(createModel).toHaveBeenCalledWith({
        id: 'public-chat',
        name: 'Public Chat',
        default_base_url: 'http://models.example.test:6195/v1',
        default_model: 'public_chat',
        auth_mode: 'none',
        api_key: null,
        clear_api_key: false,
        is_enabled: true,
        is_default: true,
        sort_order: 0,
      })
    )
  })

  it('reveals a password input for bearer-authenticated models', async () => {
    const user = userEvent.setup()
    render(<ManageProvidersDataPage />)
    await screen.findByText('Qwen Public')

    await user.click(screen.getByRole('button', { name: '新建模型' }))
    await user.click(screen.getByRole('combobox', { name: '认证方式' }))
    await user.click(
      await screen.findByRole('option', { name: 'Bearer Token' })
    )

    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'password')
  })
})
