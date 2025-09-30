import { ref, computed } from 'vue'

const user = ref<{ id: string; name: string } | null>(null)
const token = ref<string>('')

export function useUser() {
  const isLogin = computed(() => !!token.value)

  function setUser(u: { id: string; name: string }, t: string) {
    user.value = u
    token.value = t
  }

  function logout() {
    user.value = null
    token.value = ''
  }

  return {
    user,
    token,
    isLogin,
    setUser,
    logout,
  }
}
