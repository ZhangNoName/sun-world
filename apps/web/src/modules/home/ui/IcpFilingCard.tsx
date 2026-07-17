export function IcpFilingCard({ className = '' }: { className?: string }) {
  return (
    <section className={`icp-card ${className}`} aria-label="网站备案信息">
      <span>网站备案</span>
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
      >
        豫ICP备2024081960号
      </a>
    </section>
  )
}
