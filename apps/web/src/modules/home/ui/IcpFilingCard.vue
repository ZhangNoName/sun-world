<template>
  <section class="icp-card" aria-label="网站备案信息">
    <span class="icp-label">网站备案</span>
    <a
      class="icp-link"
      href="https://beian.miit.gov.cn/"
      target="_blank"
      rel="noopener noreferrer"
    >
      豫ICP备2024081960号
    </a>
  </section>
</template>

<style scoped>
.icp-card {
  width: 100%;
  padding: var(--space-4);
  border: 1px solid var(--border-lighter);
  border-radius: 8px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-card);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.icp-label {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  white-space: nowrap;
}

.icp-link {
  color: var(--text-default);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  text-align: right;
  text-decoration: none;
}

.icp-link:hover,
.icp-link:focus-visible {
  color: var(--color-accent);
  text-decoration: underline;
}

@media screen and (max-width: 695px) {
  .icp-card {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-1);
  }

  .icp-link {
    text-align: left;
  }
}
</style>
