import type { PropsWithChildren } from 'react'
import { Card, CardContent, CardDescription, CardHeader } from '@sun-world/base-ui/card'
import ThemeSwitch from '@/components/ThemeSwitch'
import './auth.css'

interface Props extends PropsWithChildren {
  eyebrow: string
  headline: string
  description: string
  formTitle: string
  formDescription: string
}
export function AuthPageShell({
  eyebrow,
  headline,
  description,
  formTitle,
  formDescription,
  children,
}: Props) {
  return (
    <main className="auth-page" data-auth-layout="login-04">
      <section className="auth-brand-panel" aria-label="Sun World">
        <div className="auth-brand-topline">
          <div className="brand-lockup">
            <img src="/logo.svg" alt="Sun World" />
            <span>Sun World</span>
          </div>
          <ThemeSwitch />
        </div>
        <div className="auth-brand-copy">
          <p className="auth-eyebrow">{eyebrow}</p>
          <h1>{headline}</h1>
          <p className="auth-brand-description">{description}</p>
        </div>
        <div className="auth-brand-art" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
      <section className="auth-form-panel">
        <Card className="auth-form-card">
          <CardHeader className="auth-card-header">
            <p className="auth-card-kicker">Sun World</p>
            <h2>{formTitle}</h2>
            <CardDescription>{formDescription}</CardDescription>
          </CardHeader>
          <CardContent className="auth-card-content">{children}</CardContent>
        </Card>
      </section>
    </main>
  )
}
