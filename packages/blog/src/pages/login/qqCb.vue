<template>
  <div class="loading-container">
    <p>正在处理 QQ 登录，请稍候...</p>
    <div>{{ allInfo }}</div>
    </div>
</template>

<script setup>
import{onMounted, ref} from 'vue'
// const router = useRouter()
// const authStore = useAuthStore()
const allInfo = ref({})

onMounted(async () => {
  // 1. 获取 URL 中的哈希或查询参数
  // QQ SDK 默认可能会以 #access_token=xxx 的形式返回
  const hash = window.location.hash
  const params = new URLSearchParams(hash.replace('#', '?'))
  const accessToken = params.get('access_token')
  console.log('获取到返回的信息',params)
  allInfo.value = params
  return

})
</script>