<script setup lang="ts" name="login">
import { useAuthStore } from '@/store/auth'
import { reactive, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { SunInput } from '@sun-world/ui/input'
import { SunButton } from '@sun-world/ui/button'
import { ElMessage, ElForm, ElFormItem } from 'element-plus'

const { t } = useI18n()
const router = useRouter()

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
          <SunInput
            v-model="form.account"
            :placeholder="$t('login.accountPlaceholder')"
            size="lg"
            clearable
          />
        </el-form-item>
        <el-form-item :label="$t('login.password')" prop="password">
          <SunInput
            v-model="form.password"
            type="password"
            :placeholder="$t('login.passwordPlaceholder')"
            size="lg"
            show-password
            clearable
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item>
          <SunButton
            variant="primary"
            size="lg"
            :loading="loading"
            class="login-btn"
            @click="handleLogin"
          >
            {{ $t('login.loginBtn') }}
          </SunButton>
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
  background: var(--color-surface-card);
  padding: var(--space-10) var(--space-8);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.login-header {
  text-align: center;
  margin-bottom: var(--space-8);
  width: 100%;
}

.logo {
  width: 64px;
  height: 64px;
  margin-bottom: var(--space-4);
}

.title {
  margin: 0;
  font-size: var(--font-size-2xl);
  font-weight: 600;
  color: var(--color-text-primary);
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
  margin-top: var(--space-2);
}

.login-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
  margin-top: var(--space-4);
}

.login-footer a {
  color: var(--color-brand);
  text-decoration: none;
  margin: 0 4px;
  cursor: pointer;
  transition: color 0.2s;
}

.login-footer a:hover {
  color: var(--color-brand-light);
}

.login-footer span {
  margin: 0 var(--space-2);
  color: var(--color-border-default);
}
</style>
