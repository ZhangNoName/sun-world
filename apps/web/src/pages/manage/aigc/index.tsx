import { Link } from 'react-router'
export default function ManageAigcPage() {
  return (
    <section className="manage-section">
      <h1>AIGC 配置</h1>
      <p>
        模型密钥与供应商配置仅由 API
        服务端环境管理，前端不会读取或保存客户端密钥。
      </p>
      <Link className="manage-link" to="/aigc">
        打开 AI 工作台
      </Link>
    </section>
  )
}
