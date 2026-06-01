<script setup lang="ts" name="login">
import router from '@/router'
import { useAuthStore } from '@/store/auth'
import { reactive, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SwInput from '@/baseCom/input/input.vue'
import SwButton from '@/baseCom/button/button.vue'
import { ElMessage, ElForm, ElFormItem } from 'element-plus'

const { t } = useI18n()

const form = reactive({
  account: '',
  password: '',
})

const loading = ref(false)
const formRef = ref<InstanceType<typeof ElForm>>()
const { login } = useAuthStore()

const rules = computed(() => ({
  account: [
    {
      required: true,
      message: t('login.accountRequiredMessage'),
      trigger: 'blur',
    },
  ],
  password: [
    {
      required: true,
      message: t('login.passwordRequiredMessage'),
      trigger: 'blur',
    },
  ],
}))

async function handleLogin() {
  if (!formRef.value) return

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) {
      ElMessage.warning(t('login.accountRequired'))
      return
    }

    loading.value = true
    try {
      const res = await login(form.account, form.password)
      if (res) {
        ElMessage.success(t('login.loginSuccess'))
        router.push({ path: '/' })
      }
    } catch (error: any) {
      ElMessage.error(error?.message || t('login.loginFailed'))
      console.error('登录失败', error)
    } finally {
      loading.value = false
    }
  })
}

function goToRegister() {
  router.push({ path: '/register' })
  console.log('goToRegister')
}
</script>

<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <h2 class="title">{{ $t('login.title') }}</h2>
      </div>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        @submit.prevent="handleLogin"
        class="login-form"
        label-position="top"
      >
        <el-form-item :label="$t('login.account')" prop="account">
          <SwInput
            v-model="form.account"
            :placeholder="$t('login.accountPlaceholder')"
            size="large"
            clearable
          />
        </el-form-item>
        <el-form-item :label="$t('login.password')" prop="password">
          <SwInput
            v-model="form.password"
            type="password"
            :placeholder="$t('login.passwordPlaceholder')"
            size="large"
            show-password
            clearable
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item>
          <SwButton
            type="primary"
            size="large"
            :loading="loading"
            class="login-btn"
            @click="handleLogin"
          >
            {{ $t('login.loginBtn') }}
          </SwButton>
        </el-form-item>
      </el-form>
      <div class="login-footer">
        <a href="/register" @click.prevent="goToRegister">
          {{ $t('login.registerLink') }}
        </a>
        <span>|</span>
        <a href="#">{{ $t('login.forgotPassword') }}</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-box {
  background: #fff;
  padding: 40px 32px;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  width: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
  width: 100%;
}

.logo {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
}

.title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.login-form {
  width: 100%;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 20px;
}

.login-form :deep(.el-input) {
  width: 100%;
}

.login-btn {
  width: 100%;
  margin-top: 8px;
}

.login-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 14px;
  color: #8590a6;
  margin-top: 16px;
}

.login-footer a {
  color: #409eff;
  text-decoration: none;
  margin: 0 4px;
  cursor: pointer;
  transition: color 0.2s;
}

.login-footer a:hover {
  color: #66b1ff;
}

.login-footer span {
  margin: 0 8px;
  color: #dcdfe6;
}
</style>
