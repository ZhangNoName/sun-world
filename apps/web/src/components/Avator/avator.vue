<script setup lang="ts" name="avator">
import { useAuthStore } from '@/store/auth'
import { storeToRefs } from 'pinia'
import { SunButton } from '@sun-world/ui/button'
import { useRouter } from 'vue-router'
const authStore = useAuthStore()
const { user } = storeToRefs(authStore)
const router = useRouter()
const loginHandle = () => {
  router.push({ path: '/login' })
}
const logoutHandle = () => {
  authStore.logout()
  router.push({ path: '/' })
}
</script>
<template>
  <div class="avator">
    <template v-if="user">
      <div class="avator-text">
        {{ user.name }}
      </div>
      <SunButton variant="danger" @click="logoutHandle">登出</SunButton>
    </template>
    <template v-else>
      <SunButton variant="primary" @click="loginHandle">登录</SunButton>
    </template>
  </div>
</template>
<style scoped>
.avator {
  display: flex;
  align-items: center;
  gap: 10px;
  .avator-text {
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--text-default);
  }
}
</style>
