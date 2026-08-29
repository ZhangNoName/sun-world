import { Link } from 'react-router'

import './privacy-policy.css'

const GOOGLE_PRIVACY_URL = 'https://policies.google.com/privacy'
const GOOGLE_CONNECTIONS_HELP_URL =
  'https://support.google.com/accounts/answer/13533235'
const SUN_WORLD_DELETION_REQUEST_URL =
  'https://github.com/ZhangNoName/sun-world/issues/new'

export function PrivacyPolicyPage() {
  return (
    <main className="privacy-policy-page">
      <article className="privacy-policy-card">
        <header className="privacy-policy-hero">
          <span>Sun World</span>
          <h1>隐私政策</h1>
          <p>
            本政策说明 Sun World 在提供 Google
            登录时如何使用和保存基础账号资料。
          </p>
          <p className="privacy-policy-updated">
            最后更新：<time dateTime="2026-08-30">2026 年 8 月 30 日</time>
          </p>
        </header>

        <section aria-labelledby="privacy-data-title">
          <h2 id="privacy-data-title">访问的信息</h2>
          <p>
            Google 登录使用的个人资料仅包括姓名、邮箱地址、头像，以及 Google
            账号唯一标识符（<code>sub</code>）。Google
            提供的验证结果仅用于判断邮箱是否为已验证资料，不读取邮箱内容。
          </p>
          <p>
            Sun World 不请求 Gmail、Google Drive、日历、通讯录、相册或 Google
            账号密码的访问权限。
          </p>
        </section>

        <section aria-labelledby="privacy-purpose-title">
          <h2 id="privacy-purpose-title">使用目的</h2>
          <ul>
            <li>确认正在登录的 Google 账号身份。</li>
            <li>
              创建新的 Sun World 账号，或登录此前已连接该 Google 身份的 Sun
              World 账号。
            </li>
            <li>在账号界面显示基础名称和头像。</li>
          </ul>
        </section>

        <section aria-labelledby="privacy-storage-title">
          <h2 id="privacy-storage-title">服务端保存</h2>
          <p>
            Sun World 在服务端保存 Google
            提供方、签发方和账号唯一标识符与站内账号之间的身份映射，并保存登录所需的姓名、头像链接和已验证邮箱。邮箱不会仅因地址相同而被用于自动合并两个账号。
          </p>
          <p>
            OAuth 授权码、Google access token 和 ID token
            仅在登录回调期间用于令牌交换、校验身份和读取上述基础资料；Sun World
            不将这些授权码或 token 写入数据库，也不作持久化保存。
          </p>
        </section>

        <section aria-labelledby="privacy-sharing-title">
          <h2 id="privacy-sharing-title">共享、转移与披露</h2>
          <p>
            Sun World 不出售 Google
            账号资料，也不会将其提供给广告商、数据经纪商、信息转售商、征信或借贷机构；这些资料不用于定向广告、再营销、用户画像，或训练
            AI / ML 模型。
          </p>
          <p>
            上述资料仅在运行和保护 Sun World
            所必需的服务端基础设施中处理，并仅由履行运维与安全职责所必需的维护者访问。除提供本政策所述登录功能、保护服务安全或履行适用法律要求外，Sun
            World 不会向其他第三方转移或披露这些资料；依法披露时仅限必要范围。
          </p>
        </section>

        <section aria-labelledby="privacy-security-title">
          <h2 id="privacy-security-title">保护措施</h2>
          <p>
            Sun World 使用 HTTPS
            传输、仅服务端执行的授权码交换和身份校验、HttpOnly 且 Secure 的会话
            Cookie、应用访问控制及最小化保存来保护 Google
            账号资料。页面脚本不会接收 Google access token 或 ID token。
          </p>
        </section>

        <section aria-labelledby="privacy-retention-title">
          <h2 id="privacy-retention-title">保留期限</h2>
          <p>
            Google 身份映射、姓名、头像链接和已验证邮箱仅在对应身份关联或 Sun
            World
            账号仍存在且这些资料仍是登录所必需时保留。身份关联或账号被删除，或经核验的删除请求处理完成后，Sun
            World 会从活动服务数据中删除不再需要的 Google 账号资料。
          </p>
          <p>
            为防止欺诈、调查安全事件或履行法律义务而确有必要的最少记录，可在实现该目的所必需的期限内单独保留；这些记录不会用于恢复已删除的登录资料、广告或
            AI 训练。
          </p>
        </section>

        <section aria-labelledby="privacy-control-title">
          <h2 id="privacy-control-title">撤销访问与删除数据</h2>
          <p>
            你可以按照 Google 的
            <a
              href={GOOGLE_CONNECTIONS_HELP_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              第三方连接管理说明
            </a>
            撤销 Sun World 的访问。撤销后，Google 不会自动删除 Sun World
            服务端已保存的身份映射。
          </p>
          <p>
            如需删除服务端身份映射，请通过
            <a
              href={SUN_WORLD_DELETION_REQUEST_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Sun World 数据删除请求入口
            </a>
            向维护者提出请求。请在公开 Issue 中只说明“申请删除 Google
            登录数据”，不要提交完整邮箱、<code>sub</code>
            或其他账号资料；维护者会另行提供非公开的身份核验方式。
          </p>
        </section>

        <section aria-labelledby="privacy-google-title">
          <h2 id="privacy-google-title">Google 的隐私政策</h2>
          <p>
            Google 对其服务中的数据处理由
            <a
              href={GOOGLE_PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Google 隐私政策
            </a>
            说明。
          </p>
        </section>

        <footer className="privacy-policy-footer">
          <Link to="/login">返回登录</Link>
          <Link to="/">返回首页</Link>
        </footer>
      </article>
    </main>
  )
}

export default PrivacyPolicyPage
