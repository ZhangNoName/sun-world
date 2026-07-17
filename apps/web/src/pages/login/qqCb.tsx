import { useEffect, useState } from 'react'
export function QqCallbackPage() {
  const [status, setStatus] = useState('正在处理 QQ 登录，请稍候…')
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    setStatus(
      params.has('access_token')
        ? 'QQ 授权已返回，正在完成登录…'
        : '未收到 QQ 授权信息'
    )
  }, [])
  return (
    <main className="qq-callback" role="status">
      {status}
    </main>
  )
}
export default QqCallbackPage
