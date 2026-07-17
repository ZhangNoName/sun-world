<script setup lang="ts" name="login">
import { useAuthStore } from '@/store/auth'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { SunInput } from '@sun-world/ui/input'
import { SunButton } from '@sun-world/ui/button'
import { ElForm, ElFormItem, ElMessage } from 'element-plus'
import AuthPageShell from './AuthPageShell.vue'

const { t } = useI18n()
const router = useRouter()

const form = reactive({
  account: '',
  password: '',
})

const loading = ref(false)
const loginError = ref('')
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

  loginError.value = ''

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) {
      loginError.value = t('login.accountRequired')
      return
    }

    loading.value = true
    try {
      const res = await login(form.account, form.password)
      if (res) {
        ElMessage.success(t('login.loginSuccess'))
        router.push({ path: '/' })
      }
    } catch (error: unknown) {
      loginError.value =
        error instanceof Error ? error.message : t('login.loginFailed')
      console.error('Login failed', error)
    } finally {
      loading.value = false
    }
  })
}

function goToRegister() {
  router.push({ path: '/register' })
}
</script>

<template>
  <AuthPageShell
    eyebrow="Sun World"
    headline="欢迎回来"
    description="登录后，继续探索属于你的世界。"
    :form-title="$t('login.title')"
    form-description="使用你的账号继续访问 Sun World。"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      class="login-form"
      label-position="top"
      @submit.prevent="handleLogin"
    >
      <el-form-item :label="$t('login.account')" prop="account">
        <SunInput
          v-model="form.account"
          type="email"
          autocomplete="username"
          :placeholder="$t('login.accountPlaceholder')"
          size="lg"
          clearable
        />
      </el-form-item>
      <el-form-item :label="$t('login.password')" prop="password">
        <SunInput
          v-model="form.password"
          type="password"
          autocomplete="current-password"
          :placeholder="$t('login.passwordPlaceholder')"
          size="lg"
          show-password
          clearable
          @keyup.enter="handleLogin"
        />
      </el-form-item>
      <p v-if="loginError" class="login-error" role="alert">
        {{ loginError }}
      </p>
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
      <span>还没有账号？</span>
      <a href="/register" @click.prevent="goToRegister">
        {{ $t('login.registerLink') }}
      </a>
    </div>
    <p class="login-support">无法登录？请联系管理员</p>
  </AuthPageShell>
</template>

<style scoped>
.login-form {
  width: 100%;
}

.login-form :deep(.el-form-item) {
  margin-bottom: var(--space-5);
}

.login-form :deep(.el-form-item__label) {
  padding-bottom: var(--space-2);
  font-weight: 600;
  color: var(--color-text-primary);
}

.login-form :deep(.el-input) {
  width: 100%;
}

.login-form :deep(.sun-ui-field),
.login-form :deep(.sun-input-wrap),
.login-form :deep(.sun-input) {
  display: block;
  width: 100%;
}

:deep(.login-btn) {
  width: 100%;
  margin-top: var(--space-1);
}

.login-error {
  margin: calc(var(--space-2) * -1) 0 var(--space-5);
  padding: var(--space-3) var(--space-4);
  color: var(--color-danger, #b91c1c);
  background: color-mix(in srgb, var(--color-danger, #dc2626) 10%, transparent);
  border: 1px solid
    color-mix(in srgb, var(--color-danger, #dc2626) 28%, transparent);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.login-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
}

.login-footer a {
  color: var(--color-brand);
  text-decoration: none;
  cursor: pointer;
  transition: color var(--motion-duration-fast) var(--motion-ease-standard);
}

.login-footer a:hover {
  color: var(--color-brand-light);
}

.login-support {
  margin: var(--space-4) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  text-align: center;
}
</style>
