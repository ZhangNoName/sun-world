export function IcpFilingCard({ className = '' }: { className?: string }) {
  return (
    <section className={`icp-card ${className}`} aria-label="网站合规信息">
      <span>网站信息</span>
      <nav className="icp-card__links" aria-label="备案与隐私">
        <a href="/privacy">隐私政策</a>
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
        >
          豫ICP备2024081960号
        </a>
      </nav>
      <p className="icp-card__google-disclosure">
        Google 登录仅使用姓名、头像、已验证邮箱和账号标识来创建或登录 Sun World
        账号，不用于广告或 AI 训练。
      </p>
    </section>
  )
}
