import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button, buttonVariants } from '@sun-world/base-ui/button'
import { Textarea } from '@sun-world/base-ui/textarea'
import { ThemeSwitch } from '@/components/ThemeSwitch'
import { fetchLocalArticle, type LocalArticle } from '../blog-qa-api'
import { useBlogQa } from '../hooks/useBlogQa'
import './blog-qa.css'

const localExamples = [
  '博客问答怎样核对参考来源？',
  '草稿和公开文章有什么区别？',
  '取消 Agent 运行后会发生什么？',
]
const statuses = {
  accepted: '等待运行',
  running: '正在搜索和读取文章…',
  completed: '回答已完成',
  failed: '本次问答失败',
  cancelled: '已取消',
  interrupted: '运行已中断，请重新提问',
}

export function BlogQaPage() {
  const qa = useBlogQa()
  const examples =
    qa.capabilities?.mode === 'site'
      ? [
          '博客里介绍了哪些 React 开发实践？',
          '怎样配置 AI 模型？',
          '文章中如何处理权限与账号？',
        ]
      : localExamples
  const running =
    qa.busy || qa.run?.status === 'running' || qa.run?.status === 'accepted'
  const reason = qa.capabilities?.reason
  const availabilityMessage =
    reason === 'active_session_required'
      ? '登录后可在本地验证名单范围内提问'
      : reason === 'blog_qa_not_allowlisted'
        ? '当前账号尚未加入本地问答名单'
        : reason === 'blog_qa_admin_required'
          ? '此本地入口目前仅向管理员账号开放'
          : reason === 'site_blog_qa_disabled'
            ? '当前环境未开放博客问答'
            : reason || '当前环境尚未开放博客问答'
  const [question, setQuestion] = useState('')
  const [params] = useSearchParams()
  const articleId = Number(params.get('article'))
  const [article, setArticle] = useState<LocalArticle | null>(null)
  const [articleError, setArticleError] = useState('')
  useEffect(() => {
    let mounted = true
    setArticle(null)
    setArticleError('')
    if (articleId > 0 && qa.capabilities?.local_validation)
      void fetchLocalArticle(articleId)
        .then((value) => {
          if (mounted) setArticle(value)
        })
        .catch(() => {
          if (mounted) setArticleError('原文暂不可读')
        })
    return () => {
      mounted = false
    }
  }, [articleId, qa.capabilities?.local_validation])
  return (
    <main className="blog-qa-page">
      <header className="blog-qa-header">
        <Link to="/aigc">← 普通 AI 对话</Link>
        <ThemeSwitch />
      </header>
      <section aria-labelledby="blog-qa-title" className="blog-qa-main">
        <p className="blog-qa-kicker">SUN WORLD · BLOG</p>
        <h1 id="blog-qa-title">问问博客</h1>
        <p>从文章中寻找答案，每条参考都可以打开原文核对。</p>
        {qa.capabilities?.local_validation && (
          <div className="blog-qa-notice" role="note">
            <strong>本地验证环境</strong>
            <span>{qa.capabilities.dataset} · 不连接生产数据</span>
            <span>模型：{qa.capabilities.model}</span>
          </div>
        )}
        {qa.capabilities?.mode === 'site' && (
          <div className="blog-qa-notice" role="note">
            <strong>本站公开博客</strong>
            <span>使用当前站点账号，答案附文章原文链接。</span>
            <span>模型：{qa.capabilities.model}</span>
          </div>
        )}
        {qa.error && <p role="alert">{qa.error}</p>}
        {qa.capabilities && !qa.capabilities.enabled && (
          <p role="status">{availabilityMessage}</p>
        )}
        {qa.capabilities?.local_validation && !qa.user && (
          <Button onClick={() => void qa.login()}>使用本地测试账号</Button>
        )}
        {qa.capabilities?.mode === 'site' && !qa.user && (
          <Link
            to="/login?return_to=%2Faigc%2Fblog-qa"
            className={buttonVariants()}
          >
            登录后提问
          </Link>
        )}
        {qa.user && (
          <div className="blog-qa-account">
            <span>{qa.user.display_name}</span>
            <Button variant="ghost" onClick={() => void qa.logout()}>
              {qa.capabilities?.mode === 'site' ? '退出登录' : '退出测试账号'}
            </Button>
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void qa.send(question)
          }}
        >
          <label htmlFor="blog-qa-question">你想了解什么？</label>
          <Textarea
            id="blog-qa-question"
            value={question}
            maxLength={2000}
            rows={4}
            placeholder="例如：博客问答怎样核对参考来源？"
            onChange={(event) => setQuestion(event.target.value)}
            disabled={running}
          />
          <div className="blog-qa-actions">
            <span>只读公开文章，不修改或发布内容</span>
            {running ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void qa.stop()}
              >
                停止回答
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={
                  !qa.user || !qa.capabilities?.enabled || !question.trim()
                }
              >
                开始提问
              </Button>
            )}
          </div>
        </form>
        <div className="blog-qa-examples" aria-label="示例问题">
          {examples.map((text) => (
            <Button
              key={text}
              variant="outline"
              disabled={running}
              onClick={() => setQuestion(text)}
            >
              {text}
            </Button>
          ))}
        </div>
        {qa.run && (
          <section
            className="blog-qa-answer"
            aria-label="问答结果"
            aria-busy={qa.busy}
          >
            <div className="blog-qa-result-heading">
              <h2>{statuses[qa.run.status]}</h2>
              <Button variant="ghost" onClick={() => void qa.refresh()}>
                刷新状态
              </Button>
            </div>
            <p className="blog-qa-question">{qa.run.question}</p>
            {qa.run.answer && (
              <p className="blog-qa-answer-text">{qa.run.answer}</p>
            )}
            {qa.run.error_code && (
              <p role="alert">
                未能完成问答，请重新提问。诊断：{qa.run.error_code}
              </p>
            )}
            {qa.run.sources.length > 0 && (
              <div className="blog-qa-sources">
                <h3>参考文章</h3>
                <ul>
                  {qa.run.sources.map((source) => (
                    <li key={source.article_id}>
                      <Link to={source.url}>{source.title}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
        {articleId > 0 && qa.capabilities?.local_validation && (
          <article className="blog-qa-answer" aria-label="参考原文">
            <Link to="/aigc/blog-qa">关闭原文</Link>
            <h2>{article?.title || '参考原文'}</h2>
            <p className="blog-qa-answer-text">
              {article?.content || articleError || '正在读取原文…'}
            </p>
          </article>
        )}
      </section>
    </main>
  )
}
export default BlogQaPage
