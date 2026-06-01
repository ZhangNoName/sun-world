<script setup lang="ts" name="register">
import router from '@/router'
import { reactive, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SwInput from '@/baseCom/input/input.vue'
import SwButton from '@/baseCom/button/button.vue'
import { ElMessage, ElForm, ElFormItem } from 'element-plus'
import type { FormRules } from 'element-plus'
import { useAuthStore } from '@/store/auth'

const { t } = useI18n()

const form = reactive({
  password: '123456',
  confirmPassword: '123456',
  name: '11111',
  email: '111@111.com',
  phone: '17683242528',
})

const loading = ref(false)
const { register } = useAuthStore()

const rules = computed<FormRules>(() => ({
  username: [
    {
      required: true,
      message: t('register.usernameRequired'),
      trigger: 'blur',
    },
    { min: 3, max: 20, message: t('register.usernameLength'), trigger: 'blur' },
  ],
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
      validator: (rule: any, value: string, callback: any) => {
        if (value !== form.password) {
          callback(new Error(t('register.passwordMismatch')))
        } else {
          callback()
        }
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
        // 注册成功后直接跳转到首页（因为已经登录了）
        router.push({ path: '/' })
      }
    } catch (error: any) {
      ElMessage.error(error?.message || t('register.registerFailed'))
      console.error('注册失败', error)
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
  <div class="register-container">
    <div class="register-box">
      <div class="register-header">
        <h2 class="title">{{ $t('register.title') }}</h2>
      </div>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        class="register-form"
        label-position="top"
      >
        <el-form-item :label="$t('register.nickname')" prop="name">
          <SwInput
            v-model="form.name"
            :placeholder="$t('register.nicknamePlaceholder')"
            size="large"
            clearable
          />
        </el-form-item>
        <el-form-item :label="$t('register.phone')" prop="phone">
          <SwInput
            v-model="form.phone"
            :placeholder="$t('register.phonePlaceholder')"
            size="large"
            clearable
          />
        </el-form-item>
        <el-form-item :label="$t('register.email')" prop="email">
          <SwInput
            v-model="form.email"
            type="email"
            :placeholder="$t('register.emailPlaceholder')"
            size="large"
            clearable
          />
        </el-form-item>

        <el-form-item :label="$t('register.password')" prop="password">
          <SwInput
            v-model="form.password"
            type="password"
            :placeholder="$t('register.passwordPlaceholder')"
            size="large"
            show-password
            clearable
          />
        </el-form-item>
        <el-form-item
          :label="$t('register.confirmPassword')"
          prop="confirmPassword"
        >
          <SwInput
            v-model="form.confirmPassword"
            type="password"
            :placeholder="$t('register.confirmPasswordPlaceholder')"
            size="large"
            show-password
            clearable
          />
        </el-form-item>

        <el-form-item>
          <SwButton
            type="primary"
            size="large"
            :loading="loading"
            class="register-btn"
            @click="handleRegister"
          >
            {{ $t('register.registerBtn') }}
          </SwButton>
        </el-form-item>
      </el-form>
      <div class="register-footer">
        <span>{{ $t('register.hasAccount') }}</span>
        <a href="#" @click.prevent="goToLogin">
          {{ $t('register.goToLogin') }}
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.register-container {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.register-box {
  background: #fff;
  padding: 40px 32px;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.register-header {
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

.register-form {
  width: 100%;
}

.register-form :deep(.el-form-item) {
  margin-bottom: 20px;
}

.register-form :deep(.el-form-item__label) {
  font-weight: 500;
  color: #606266;
}

.register-form :deep(.el-input) {
  width: 100%;
}

.register-btn {
  width: 100%;
  margin-top: 8px;
}

.register-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 14px;
  color: #8590a6;
  margin-top: 16px;
}

.register-footer span {
  margin-right: 8px;
}

.register-footer a {
  color: #409eff;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s;
}

.register-footer a:hover {
  color: #66b1ff;
}
</style>
