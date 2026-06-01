<script setup lang="ts" name="avator">
import { useAuthStore } from '@/store/auth'
import { storeToRefs } from 'pinia'
import SwBtn from '@/baseCom/btn/btn.vue'
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
      <SwBtn type="danger" @click="logoutHandle">登出</SwBtn>
    </template>
    <template v-else>
      <SwBtn type="primary" @click="loginHandle">登录</SwBtn>
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
