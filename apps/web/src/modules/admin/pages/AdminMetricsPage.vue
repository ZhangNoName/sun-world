<script setup lang="ts">
import LoadingSkeleton from '@/shared/ui/LoadingSkeleton.vue'
import { useAdminMetrics } from '../composables/useAdminMetrics'

const {
  snapshot,
  routes,
  statuses,
  metricCards,
  loading,
  errorMessage,
  lastLoadedAt,
  refresh,
  formatDateTime,
  formatNumber,
} = useAdminMetrics()
</script>

<template>
  <main class="admin-metrics-page">
    <header class="metrics-header">
      <div class="header-copy">
        <p class="eyebrow">Operations</p>
        <h1>后台指标</h1>
        <p class="summary">
          {{ snapshot ? '请求、错误和延迟的当前进程快照' : '正在准备指标快照' }}
        </p>
      </div>

      <div class="header-actions">
        <span class="last-loaded">
          {{ lastLoadedAt ? `更新 ${formatDateTime(lastLoadedAt)}` : '尚未更新' }}
        </span>
        <button
          class="refresh-button"
          type="button"
          :disabled="loading"
          @click="refresh"
        >
          {{ loading ? '刷新中' : '刷新' }}
        </button>
      </div>
    </header>

    <section v-if="errorMessage" class="metrics-alert" role="status">
      {{ errorMessage }}
    </section>

    <section class="metrics-grid" aria-label="请求指标概览">
      <LoadingSkeleton v-if="loading && !snapshot" :lines="3" />

      <article
        v-for="card in metricCards"
        v-else
        :key="card.key"
        class="metric-card"
        :class="`metric-card-${card.tone}`"
      >
        <p class="metric-label">{{ card.label }}</p>
        <strong class="metric-value">{{ card.value }}</strong>
        <span class="metric-caption">{{ card.caption }}</span>
      </article>
    </section>

    <section class="metrics-content">
      <article class="metrics-panel">
        <div class="panel-heading">
          <h2>路由延迟</h2>
          <span>{{ routes.length }} 条</span>
        </div>

        <div class="route-list">
          <div v-if="!routes.length" class="empty-state">暂无路由指标</div>
          <div
            v-for="route in routes"
            :key="`${route.method}:${route.route}`"
            class="route-row"
          >
            <div class="route-main">
              <span class="method">{{ route.method }}</span>
              <span class="route-path">{{ route.route }}</span>
            </div>
            <div class="route-stats">
              <span>{{ formatNumber(route.count) }} 次</span>
              <span>{{ formatNumber(route.avg_duration_ms) }}ms 平均</span>
              <span>{{ formatNumber(route.max_duration_ms) }}ms 峰值</span>
              <span
                class="route-errors"
                :class="{ active: route.error_count > 0 }"
              >
                {{ formatNumber(route.error_count) }} 错误
              </span>
            </div>
          </div>
        </div>
      </article>

      <aside class="metrics-panel status-panel">
        <div class="panel-heading">
          <h2>状态码</h2>
          <span>{{ statuses.length }} 类</span>
        </div>

        <div class="status-list">
          <div v-if="!statuses.length" class="empty-state">暂无状态码数据</div>
          <div
            v-for="item in statuses"
            :key="item.status"
            class="status-row"
          >
            <span
              class="status-code"
              :class="{
                warning: item.status >= 400 && item.status < 500,
                danger: item.status >= 500,
              }"
            >
              {{ item.status }}
            </span>
            <div class="status-bar">
              <span
                :style="{
                  width: `${Math.max(
                    8,
                    (item.count / Math.max(1, snapshot?.total_requests ?? 1)) * 100
                  )}%`,
                }"
              ></span>
            </div>
            <strong>{{ formatNumber(item.count) }}</strong>
          </div>
        </div>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.admin-metrics-page {
  min-height: 100%;
  padding: var(--space-6);
  color: var(--text-default);
  background: var(--bg-page);
  overflow: auto;
}

.metrics-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.header-copy {
  display: grid;
  gap: var(--space-2);
}

.eyebrow {
  margin: 0;
  color: var(--color-accent);
  font-size: var(--font-size-sm);
  font-weight: 700;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  color: var(--text-strong);
  font-size: var(--font-size-3xl);
  line-height: var(--line-height-tight);
}

h2 {
  color: var(--text-strong);
  font-size: var(--font-size-xl);
  line-height: var(--line-height-tight);
}

.summary,
.last-loaded,
.metric-caption,
.panel-heading span {
  color: var(--text-secondary);
  font-size: var(--font-size-md);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.refresh-button {
  min-width: 84px;
  min-height: var(--btn-height-default);
  border: 1px solid var(--border-active);
  border-radius: var(--radius-md);
  padding: var(--btn-padding-default);
  color: var(--btn-text-color);
  background: var(--color-brand);
  font-size: var(--font-size-md);
  cursor: pointer;
  transition:
    transform var(--motion-duration-fast) var(--motion-ease-standard),
    opacity var(--motion-duration-fast) var(--motion-ease-standard);
}

.refresh-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.refresh-button:disabled {
  cursor: not-allowed;
  opacity: var(--btn-disabled-opacity);
}

.metrics-alert {
  margin-bottom: var(--space-4);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  color: var(--color-danger);
  background: var(--bg-component);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.metric-card,
.metrics-panel {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-component);
}

.metric-card {
  display: grid;
  gap: var(--space-2);
  min-height: 132px;
  padding: var(--space-5);
  animation: metrics-enter var(--motion-duration-slow) var(--motion-ease-emphasized)
    both;
}

.metric-label {
  color: var(--text-secondary);
  font-size: var(--font-size-md);
}

.metric-value {
  color: var(--text-strong);
  font-size: var(--font-size-3xl);
  line-height: var(--line-height-tight);
}

.metric-card-success {
  border-color: var(--color-success);
}

.metric-card-warning {
  border-color: var(--color-warning);
}

.metric-card-danger {
  border-color: var(--color-danger);
}

.metrics-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: var(--space-4);
  align-items: start;
}

.metrics-panel {
  min-width: 0;
  padding: var(--space-5);
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.route-list,
.status-list {
  display: grid;
  gap: var(--space-3);
}

.route-row,
.status-row {
  border: 1px solid var(--border-lighter);
  border-radius: var(--radius-md);
  background: var(--bg-raised);
}

.route-row {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
}

.route-main,
.route-stats,
.status-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.route-main {
  min-width: 0;
}

.method,
.status-code {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  min-height: 28px;
  border-radius: var(--radius-sm);
  color: var(--color-brand);
  background: var(--bg-brand-light);
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.route-path {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--text-strong);
  font-size: var(--font-size-md);
}

.route-stats {
  flex-wrap: wrap;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.route-errors.active,
.status-code.danger {
  color: var(--color-danger);
  background: var(--bg-component);
}

.status-code.warning {
  color: var(--color-warning);
  background: var(--bg-component);
}

.status-row {
  min-height: 48px;
  padding: var(--space-3);
}

.status-bar {
  flex: 1;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--bg-fill);
  overflow: hidden;
}

.status-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-accent);
}

.empty-state {
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  color: var(--text-secondary);
  text-align: center;
  background: var(--bg-raised);
}

@keyframes metrics-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1024px) {
  .metrics-grid,
  .metrics-content {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .metrics-panel:first-child {
    grid-column: 1 / -1;
  }
}

@media (max-width: 720px) {
  .admin-metrics-page {
    padding: var(--space-4);
  }

  .metrics-header,
  .header-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .metrics-grid,
  .metrics-content {
    grid-template-columns: 1fr;
  }

  .route-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .metric-card,
  .refresh-button {
    animation: none;
    transition: none;
  }
}
</style>
