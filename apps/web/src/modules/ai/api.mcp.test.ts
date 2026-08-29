import { callAiMcpTool } from './api'
import { apiPost } from '@/shared/api'
import { API_ROUTES } from '@sun-world/contracts'

vi.mock('@/shared/api', () => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}))

describe('MCP API paths', () => {
  it('uses encoded-path parameters and always sends confirmed true', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      call_id: 'call-1',
      connection_id: 'connection/with space',
      tool_name: 'issue/search ?',
      status: 'succeeded',
      result: null,
      result_metadata: {},
      completed_at: '2026-08-29T08:00:00Z',
    } as never)

    await callAiMcpTool('connection/with space', 'issue/search ?', {
      query: '安全',
    })

    expect(apiPost).toHaveBeenCalledWith(
      API_ROUTES.ai.mcpToolCall,
      { arguments: { query: '安全' }, confirmed: true },
      {
        path: {
          connection_id: 'connection/with space',
          tool_name: 'issue/search ?',
        },
        config: { suppressErrorToast: true },
      }
    )
  })
})
