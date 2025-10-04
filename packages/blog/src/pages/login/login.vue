<script setup lang="ts" name="login">
import router from '@/router'
import { useAuthStore } from '@/store/auth'
import { reactive } from 'vue'

const form = reactive({
  account: '',
  password: '',
})
const { login } = useAuthStore()
async function handleLogin() {
  // 模拟登录逻辑
  try {
    const res = await login(form.account, form.password)
    // console.log('登录界面', res)
    if (res) {
      router.push({ path: '/' })
    }
  } catch (error) {
    console.log('登录失败', error)
  }
}
</script>
<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <img src="/logo.svg" alt="logo" class="logo" />
      </div>
      <form @submit.prevent="handleLogin">
        <div class="input-group">
          <input
            v-model="form.account"
            type="text"
            placeholder="手机号或邮箱"
            required
          />
        </div>
        <div class="input-group">
          <input
            v-model="form.password"
            type="password"
            placeholder="密码"
            required
          />
        </div>
        <button class="login-btn" type="submit">登录</button>
      </form>
      <div class="login-footer">
        <a href="#">注册新账号</a>
        <span>|</span>
        <a href="#">忘记密码？</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
}
.login-box {
  background: #fff;
  padding: 40px 32px;
  border-radius: 8px;
  box-shadow: 0 2px 16px rgba(173, 163, 163, 0.08);
  width: 340px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.login-header {
  text-align: center;
  margin-bottom: 24px;
}
.logo {
  width: 48px;
  height: 48px;
  margin-bottom: 8px;
}
.subtitle {
  color: #8590a6;
  font-size: 14px;
  margin-top: 4px;
}
.input-group {
  width: 100%;
  margin-bottom: 16px;
}
.input-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 16px;
  outline: none;
  transition: border-color 0.2s;
}
.input-group input:focus {
  border-color: #0084ff;
}
.login-btn {
  width: 100%;
  padding: 10px 0;
  background: #0084ff;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  margin-bottom: 12px;
  transition: background 0.2s;
}
.login-btn:hover {
  background: #006fd6;
}
.login-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 14px;
  color: #8590a6;
}
.login-footer a {
  color: #0084ff;
  text-decoration: none;
  margin: 0 4px;
}
.login-footer span {
  margin: 0 4px;
}
</style>
