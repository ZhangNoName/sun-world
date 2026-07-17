import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
export default function NotFound() {
  const navigate = useNavigate()
  useEffect(() => {
    const timer = window.setTimeout(
      () => navigate('/', { replace: true }),
      1500
    )
    return () => window.clearTimeout(timer)
  }, [navigate])
  return (
    <main className="page-container">
      <h1>页面未找到</h1>
      <p>即将返回首页。</p>
      <Link to="/">立即返回</Link>
    </main>
  )
}
