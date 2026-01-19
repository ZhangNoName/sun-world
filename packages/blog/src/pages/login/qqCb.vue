<template>
  <div class="loading-container">
    <p>正在处理 QQ 登录，请稍候...</p>
    </div>
</template>

<script setup>
const router = useRouter()
const authStore = useAuthStore()

onMounted(async () => {
  // 1. 获取 URL 中的哈希或查询参数
  // QQ SDK 默认可能会以 #access_token=xxx 的形式返回
  const hash = window.location.hash
  const params = new URLSearchParams(hash.replace('#', '?'))
  const accessToken = params.get('access_token')
  console.log('获取到返回的信息',params)
  return
  if (accessToken) {
    try {
      // 2. 将 token 发送给你的 FastAPI 后端进行验证并换取你自己的 JWT
      // 建议后端逻辑：验证 token -> 获取 OpenID -> 登录/注册 -> 返回你自己的 Cookie
      await $fetch('/api/v1/auth/qq/callback', {
        method: 'POST',
        body: { access_token: accessToken }
      })

      // 3. 登录成功，更新 store 并跳转到首页或之前的页面
      await authStore.updateUserInfo()
      router.push('/')
    } catch (err) {
      console.error('QQ 登录失败:', err)
      alert('登录失败，请重试')
      router.push('/login')
    }
  }
})
</script>