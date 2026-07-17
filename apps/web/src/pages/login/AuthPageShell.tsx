import type { PropsWithChildren } from 'react'
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
    <main className="auth-page">
      <section className="auth-brand-panel" aria-label="Sun World">
        <div className="brand-lockup">
          <img src="/logo.svg" alt="Sun World" />
          <span>Sun World</span>
        </div>
        <div>
          <p>{eyebrow}</p>
          <h1>{headline}</h1>
          <p>{description}</p>
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form-card">
          <header>
            <p>Sun World</p>
            <h2>{formTitle}</h2>
            <p>{formDescription}</p>
          </header>
          {children}
        </div>
      </section>
    </main>
  )
}
