import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { useAuthStore } from '@/store/auth'
import { useManageCopy } from '../manageCopy'

export function hasAdminRole(
  user: { roles?: Array<{ code?: string | null }> } | null
) {
  return Boolean(
    user?.roles?.some((role) => role.code?.trim().toLowerCase() === 'admin')
  )
}

export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const copy = useManageCopy()
  const user = useAuthStore((state) => state.user)
  const getUser = useAuthStore((state) => state.getUser)
  const [state, setState] = useState<
    'checking' | 'authorized' | 'unauthorized' | 'forbidden'
  >(hasAdminRole(user) ? 'authorized' : 'checking')

  useEffect(() => {
    let active = true
    if (user) {
      setState(hasAdminRole(user) ? 'authorized' : 'forbidden')
      return () => {
        active = false
      }
    }
    void getUser().then((restored) => {
      if (!active) return
      setState(
        restored
          ? hasAdminRole(restored)
            ? 'authorized'
            : 'forbidden'
          : 'unauthorized'
      )
    })
    return () => {
      active = false
    }
  }, [getUser, user])

  if (state === 'checking') {
    return (
      <section className="manage-guard-state" role="status">
        {copy.guard.checking}
      </section>
    )
  }
  if (state === 'unauthorized') {
    return (
      <section className="manage-guard-state">
        <h1>{copy.guard.signInRequired}</h1>
        <p role="alert">{copy.guard.signInMessage}</p>
        <Link className="manage-guard-link" to="/login">
          {copy.guard.signIn}
        </Link>
      </section>
    )
  }
  if (state === 'forbidden') {
    return (
      <section className="manage-guard-state">
        <h1>{copy.guard.adminRequired}</h1>
        <p role="alert">{copy.guard.forbiddenMessage}</p>
      </section>
    )
  }
  return <>{children}</>
}
