<script setup lang="ts">
defineProps<{
  eyebrow: string
  headline: string
  description: string
  formTitle: string
  formDescription: string
}>()
</script>

<template>
  <main class="auth-page">
    <section class="auth-brand-panel" aria-label="Sun World">
      <div class="brand-lockup">
        <img src="/logo.svg" alt="Sun World" width="48" height="48" />
        <span>Sun World</span>
      </div>

      <div class="brand-copy">
        <p class="brand-eyebrow">{{ eyebrow }}</p>
        <h1>{{ headline }}</h1>
        <p class="brand-description">{{ description }}</p>
      </div>
    </section>

    <section class="auth-form-panel">
      <div class="auth-form-card">
        <header class="auth-form-header">
          <p class="auth-form-eyebrow">Sun World</p>
          <h2>{{ formTitle }}</h2>
          <p>{{ formDescription }}</p>
        </header>
        <slot />
      </div>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(420px, 0.95fr);
  background: var(--bg-page);
}

.auth-brand-panel {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100%;
  padding: clamp(2rem, 5vw, 5.5rem);
  color: #eff6ff;
  background:
    linear-gradient(145deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.48)),
    linear-gradient(135deg, #1d4ed8, #0f3d91);
}

.brand-lockup {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  width: fit-content;
  font-size: var(--font-size-lg);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.brand-lockup img {
  width: 48px;
  height: 48px;
  padding: 5px;
  border-radius: var(--radius-xl);
  background: rgba(255, 255, 255, 0.94);
}

.brand-copy {
  max-width: 31rem;
  margin: auto 0;
}

.brand-eyebrow,
.auth-form-eyebrow {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-sm);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.brand-eyebrow {
  color: rgba(239, 246, 255, 0.78);
}

.brand-copy h1 {
  max-width: 10em;
  margin: 0;
  color: #fff;
  font-size: clamp(2.4rem, 4vw, 4.5rem);
  line-height: 1.08;
  letter-spacing: -0.055em;
}

.brand-description {
  max-width: 29rem;
  margin: var(--space-6) 0 0;
  color: rgba(239, 246, 255, 0.86);
  font-size: var(--font-size-lg);
  line-height: 1.75;
}

.auth-form-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(1.5rem, 5vw, 5rem);
}

.auth-form-card {
  width: min(100%, 29rem);
}

.auth-form-header {
  margin-bottom: var(--space-8);
}

.auth-form-eyebrow {
  color: var(--color-brand);
}

.auth-form-header h2 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-3xl);
  line-height: 1.2;
  letter-spacing: -0.035em;
}

.auth-form-header > p:last-child {
  margin: var(--space-3) 0 0;
  color: var(--color-text-secondary);
  line-height: 1.65;
}

@media (max-width: 900px) {
  .auth-page {
    grid-template-columns: minmax(0, 0.8fr) minmax(360px, 1fr);
  }

  .auth-brand-panel {
    padding: var(--space-8);
  }
}

@media (max-width: 720px) {
  .auth-page {
    display: block;
    min-height: 100%;
  }

  .auth-brand-panel {
    display: none;
  }

  .auth-form-panel {
    min-height: 100dvh;
    align-items: flex-start;
    padding: max(2rem, env(safe-area-inset-top, 0px)) var(--space-5)
      max(2rem, env(safe-area-inset-bottom, 0px));
  }

  .auth-form-card {
    width: 100%;
    margin: auto 0;
  }
}
</style>
