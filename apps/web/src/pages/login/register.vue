<script setup lang="ts" name="register">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { SunInput } from '@sun-world/ui/input'
import { SunButton } from '@sun-world/ui/button'
import { ElForm, ElFormItem, ElMessage } from 'element-plus'
import type { FormRules } from 'element-plus'
import { useAuthStore } from '@/store/auth'
import AuthPageShell from './AuthPageShell.vue'

const { t } = useI18n()
const router = useRouter()

const form = reactive({
  password: '',
  confirmPassword: '',
  name: '',
  email: '',
  phone: '',
})

const loading = ref(false)
const { register } = useAuthStore()

const rules = computed<FormRules>(() => ({
  password: [
    {
      required: true,
      message: t('register.passwordRequired'),
      trigger: 'blur',
    },
    { min: 6, max: 20, message: t('register.passwordLength'), trigger: 'blur' },
  ],
  confirmPassword: [
    {
      required: true,
      message: t('register.confirmPasswordRequired'),
      trigger: 'blur',
    },
    {
      validator: (
        _rule: unknown,
        value: string,
        callback: (error?: Error) => void
      ) => {
        callback(
          value === form.password
            ? undefined
            : new Error(t('register.passwordMismatch'))
        )
      },
      trigger: 'blur',
    },
  ],
  name: [
    {
      required: true,
      message: t('register.nicknameRequired'),
      trigger: 'blur',
    },
    { min: 2, max: 20, message: t('register.nicknameLength'), trigger: 'blur' },
  ],
  email: [
    {
      required: true,
      type: 'email' as const,
      message: t('register.emailInvalid'),
      trigger: 'change',
    },
  ],
  phone: [
    {
      required: true,
      pattern: /^1[3-9]\d{9}$/,
      message: t('register.phoneInvalid'),
      trigger: 'change',
    },
  ],
}))

const formRef = ref<InstanceType<typeof ElForm>>()

async function handleRegister() {
  if (!formRef.value) return

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) {
      ElMessage.warning(t('register.formIncomplete'))
      return
    }

    loading.value = true
    try {
      const res = await register({
        password: form.password,
        name: form.name,
        email: form.email,
        phone: form.phone,
      })
      if (res) {
        ElMessage.success(t('register.registerSuccess'))
        router.push({ path: '/' })
      }
    } catch (error: unknown) {
      ElMessage.error(
        error instanceof Error ? error.message : t('register.registerFailed')
      )
      console.error('Registration failed', error)
    } finally {
      loading.value = false
    }
  })
}

function goToLogin() {
  router.push({ path: '/login' })
}
</script>

<template>
  <AuthPageShell
    eyebrow="Sun World"
    headline="加入 Sun World"
    description="创建账号，开始记录、分享和探索。"
    :form-title="$t('register.title')"
    form-description="填写基础信息，即可创建新的账号。"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      class="register-form"
      label-position="top"
      @submit.prevent="handleRegister"
    >
      <el-form-item :label="$t('register.nickname')" prop="name">
        <SunInput
          v-model="form.name"
          autocomplete="nickname"
          :placeholder="$t('register.nicknamePlaceholder')"
          size="lg"
          clearable
        />
      </el-form-item>
      <el-form-item :label="$t('register.phone')" prop="phone">
        <SunInput
          v-model="form.phone"
          autocomplete="tel"
          :placeholder="$t('register.phonePlaceholder')"
          size="lg"
          clearable
        />
      </el-form-item>
      <el-form-item :label="$t('register.email')" prop="email">
        <SunInput
          v-model="form.email"
          type="email"
          autocomplete="email"
          :placeholder="$t('register.emailPlaceholder')"
          size="lg"
          clearable
        />
      </el-form-item>
      <el-form-item :label="$t('register.password')" prop="password">
        <SunInput
          v-model="form.password"
          type="password"
          autocomplete="new-password"
          :placeholder="$t('register.passwordPlaceholder')"
          size="lg"
          show-password
          clearable
        />
      </el-form-item>
      <el-form-item
        :label="$t('register.confirmPassword')"
        prop="confirmPassword"
      >
        <SunInput
          v-model="form.confirmPassword"
          type="password"
          autocomplete="new-password"
          :placeholder="$t('register.confirmPasswordPlaceholder')"
          size="lg"
          show-password
          clearable
          @keyup.enter="handleRegister"
        />
      </el-form-item>
      <el-form-item>
        <SunButton
          variant="primary"
          size="lg"
          :loading="loading"
          class="register-btn"
          @click="handleRegister"
        >
          {{ $t('register.registerBtn') }}
        </SunButton>
      </el-form-item>
    </el-form>
    <div class="register-footer">
      <span>{{ $t('register.hasAccount') }}</span>
      <a href="/login" @click.prevent="goToLogin">
        {{ $t('register.goToLogin') }}
      </a>
    </div>
  </AuthPageShell>
</template>

<style scoped>
.register-form {
  width: 100%;
}

.register-form :deep(.el-form-item) {
  margin-bottom: var(--space-4);
}

.register-form :deep(.el-form-item__label) {
  padding-bottom: var(--space-1);
  font-weight: 600;
  color: var(--color-text-primary);
}

.register-form :deep(.el-input) {
  width: 100%;
}

.register-form :deep(.sun-ui-field),
.register-form :deep(.sun-input-wrap),
.register-form :deep(.sun-input) {
  display: block;
  width: 100%;
}

:deep(.register-btn) {
  width: 100%;
  margin-top: var(--space-1);
}

.register-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
}

.register-footer a {
  color: var(--color-brand);
  text-decoration: none;
  cursor: pointer;
  transition: color var(--motion-duration-fast) var(--motion-ease-standard);
}

.register-footer a:hover {
  color: var(--color-brand-light);
}
</style>
