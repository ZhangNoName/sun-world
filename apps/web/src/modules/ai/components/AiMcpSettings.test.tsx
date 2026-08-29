import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  callAiMcpTool,
  createAiMcpConnection,
  deleteAiMcpConnection,
  discoverAiMcpConnection,
  fetchAiMcpConnections,
  fetchAiMcpTools,
  updateAiMcpConnection,
  type AiMcpConnection,
  type AiMcpTool,
} from '../api'
import { AiMcpSettings } from './AiMcpSettings'

vi.mock('../api', () => ({
  fetchAiMcpConnections: vi.fn(),
  createAiMcpConnection: vi.fn(),
  updateAiMcpConnection: vi.fn(),
  deleteAiMcpConnection: vi.fn(),
  discoverAiMcpConnection: vi.fn(),
  fetchAiMcpTools: vi.fn(),
  callAiMcpTool: vi.fn(),
}))

const connection: AiMcpConnection = {
  id: 'connection/1',
  name: '项目工具',
  endpoint: 'https://mcp.example.com/mcp',
  enabled: true,
  revision: 1,
  catalog_revision: 1,
  has_bearer_token: true,
  bearer_token_hint: 'tok…1234',
  last_discovered_at: '2026-08-29T08:00:00Z',
}

const tool: AiMcpTool = {
  connection_id: connection.id,
  name: 'issue/search',
  description: '搜索项目问题',
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string' } },
  },
  annotations: {},
  discovered_at: '2026-08-29T08:00:00Z',
}

const fetchConnections = vi.mocked(fetchAiMcpConnections)
const createConnection = vi.mocked(createAiMcpConnection)
const updateConnection = vi.mocked(updateAiMcpConnection)
const deleteConnection = vi.mocked(deleteAiMcpConnection)
const discoverConnection = vi.mocked(discoverAiMcpConnection)
const fetchTools = vi.mocked(fetchAiMcpTools)
const callTool = vi.mocked(callAiMcpTool)

describe('AiMcpSettings', () => {
  beforeEach(() => {
    fetchConnections.mockReset().mockResolvedValue([])
    createConnection.mockReset().mockResolvedValue(connection)
    updateConnection.mockReset().mockResolvedValue(connection)
    deleteConnection.mockReset().mockResolvedValue(null)
    discoverConnection.mockReset().mockResolvedValue({
      connection,
      tools: [tool],
    })
    fetchTools.mockReset().mockResolvedValue([tool])
    callTool.mockReset().mockResolvedValue({
      call_id: 'call-1',
      connection_id: connection.id,
      tool_name: tool.name,
      status: 'succeeded',
      result: { items: ['A'] },
      result_metadata: { bytes: 15 },
      completed_at: '2026-08-29T08:00:00Z',
    })
  })

  it('keeps guest chat available and never loads private connections', async () => {
    const user = userEvent.setup()
    render(<AiMcpSettings isAuthenticated={false} />)

    await user.click(screen.getByRole('button', { name: /MCP 设置/ }))

    expect(screen.getByText('登录后管理 MCP 远程工具')).toBeInTheDocument()
    expect(screen.getByText(/无需登录也能继续聊天/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去登录' })).toHaveAttribute(
      'href',
      '/login?return_to=%2Faigc'
    )
    expect(fetchConnections).not.toHaveBeenCalled()
  })

  it('clears cached MCP data when the signed-in account changes', async () => {
    const user = userEvent.setup()
    const otherConnection = {
      ...connection,
      id: 'connection-2',
      name: '另一个账户的工具',
      has_bearer_token: false,
      bearer_token_hint: null,
    }
    fetchConnections
      .mockResolvedValueOnce([connection])
      .mockResolvedValueOnce([otherConnection])
    const { rerender } = render(
      <AiMcpSettings isAuthenticated accountKey={7} />
    )
    await user.click(screen.getByRole('button', { name: /MCP 设置/ }))
    expect(await screen.findByText(connection.name)).toBeInTheDocument()

    rerender(<AiMcpSettings isAuthenticated accountKey={8} />)

    expect(await screen.findByText(otherConnection.name)).toBeInTheDocument()
    expect(screen.queryByText(connection.name)).not.toBeInTheDocument()
    expect(fetchConnections).toHaveBeenCalledTimes(2)
  })

  it('creates HTTPS connections and rejects insecure endpoints in the client', async () => {
    const user = userEvent.setup()
    render(<AiMcpSettings isAuthenticated />)
    await user.click(screen.getByRole('button', { name: /MCP 设置/ }))
    await screen.findByText(/还没有 MCP 连接/)

    await user.click(screen.getByRole('button', { name: '新建连接' }))
    await user.type(screen.getByLabelText('连接名称'), '知识库')
    await user.type(
      screen.getByLabelText('HTTPS 服务地址'),
      'http://mcp.example.com/mcp'
    )
    await user.type(screen.getByLabelText(/Bearer Token/), 'secret-token-value')
    await user.click(screen.getByRole('button', { name: '保存连接' }))

    expect(screen.getByRole('alert')).toHaveTextContent('必须使用 HTTPS')
    expect(createConnection).not.toHaveBeenCalled()

    const endpoint = screen.getByLabelText('HTTPS 服务地址')
    await user.clear(endpoint)
    await user.type(endpoint, 'https://mcp.example.com/mcp')
    await user.click(screen.getByRole('button', { name: '保存连接' }))

    await waitFor(() =>
      expect(createConnection).toHaveBeenCalledWith({
        name: '知识库',
        endpoint: 'https://mcp.example.com/mcp',
        bearer_token: 'secret-token-value',
        enabled: true,
      })
    )
  })

  it('never echoes a saved token and can explicitly clear it while editing', async () => {
    const user = userEvent.setup()
    fetchConnections.mockResolvedValue([connection])
    render(<AiMcpSettings isAuthenticated />)
    await user.click(screen.getByRole('button', { name: /MCP 设置/ }))
    await screen.findByText(connection.name)

    const connectionButton = screen.getByRole('button', {
      name: `查看 ${connection.name} 的工具`,
    })
    expect(connectionButton).toHaveAttribute('data-slot', 'button')
    expect(connectionButton).toHaveAttribute('aria-pressed', 'false')

    await user.click(
      screen.getByRole('button', {
        name: `编辑 MCP 连接 ${connection.name}`,
      })
    )
    const token = screen.getByLabelText('Bearer Token（可选，保存后不回显）')
    expect(token).toHaveValue('')
    expect(screen.getByText(/tok…1234/)).toBeInTheDocument()
    expect(
      screen.queryByDisplayValue('secret-token-value')
    ).not.toBeInTheDocument()

    const clearToken = screen.getByRole('checkbox', {
      name: '清除已保存的 Bearer Token',
    })
    expect(clearToken).toHaveAttribute('data-slot', 'checkbox')
    await user.click(clearToken)
    await user.click(screen.getByRole('button', { name: '保存连接' }))

    await waitFor(() =>
      expect(updateConnection).toHaveBeenCalledWith(connection.id, {
        name: connection.name,
        endpoint: connection.endpoint,
        bearer_token: undefined,
        clear_bearer_token: true,
        enabled: true,
      })
    )
  })

  it('discovers, lists, and calls a tool only after explicit confirmation', async () => {
    const user = userEvent.setup()
    fetchConnections.mockResolvedValue([connection])
    render(<AiMcpSettings isAuthenticated />)
    await user.click(screen.getByRole('button', { name: /MCP 设置/ }))
    await screen.findByText(connection.name)

    await user.click(
      screen.getByRole('button', { name: `发现工具 ${connection.name}` })
    )
    await waitFor(() =>
      expect(discoverConnection).toHaveBeenCalledWith(connection.id)
    )
    expect(await screen.findByText(tool.name)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '手动调用' }))
    expect(screen.getByText(/不会由 AI 自动触发/)).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: '确认并立即调用' })
    expect(submit).toBeDisabled()
    expect(callTool).not.toHaveBeenCalled()

    const argumentsInput = screen.getByLabelText('调用参数（JSON 对象）')
    fireEvent.change(argumentsInput, { target: { value: '{"query":"登录"}' } })
    const confirmation = screen.getByRole('checkbox', {
      name: /我确认立即调用/,
    })
    expect(confirmation).toHaveAttribute('data-slot', 'checkbox')
    await user.click(confirmation)
    await user.click(submit)

    await waitFor(() =>
      expect(callTool).toHaveBeenCalledWith(connection.id, tool.name, {
        query: '登录',
      })
    )
    expect(await screen.findByText('调用结果')).toBeInTheDocument()
    expect(screen.getByText(/"items":/)).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: /我确认立即调用/ })
    ).not.toBeChecked()
  })

  it('requires confirmation before deleting a connection', async () => {
    const user = userEvent.setup()
    fetchConnections.mockResolvedValue([connection])
    render(<AiMcpSettings isAuthenticated />)
    await user.click(screen.getByRole('button', { name: /MCP 设置/ }))
    await screen.findByText(connection.name)

    await user.click(
      screen.getByRole('button', {
        name: `删除 MCP 连接 ${connection.name}`,
      })
    )
    expect(screen.getByText(/确认删除连接/)).toBeInTheDocument()
    expect(deleteConnection).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() =>
      expect(deleteConnection).toHaveBeenCalledWith(connection.id)
    )
  })
})
