<script setup lang="ts">
import { SunLoadingSkeleton as LoadingSkeleton } from '@sun-world/ui/loading-skeleton'
import { useAdminLogs } from '../composables/useAdminLogs'

const {
  snapshot,
  events,
  loading,
  errorMessage,
  severity,
  eventType,
  lastLoadedAt,
  refresh,
  formatDateTime,
} = useAdminLogs()
</script>

<template>
  <main class="admin-logs-page">
    <header class="logs-header">
      <div>
        <p class="eyebrow">Operations</p>
        <h1>Audit logs</h1>
        <p class="summary">近期服务生命周期、失败请求与写操作审计记录。</p>
      </div>
      <div class="header-actions">
        <span class="last-loaded">
          {{
            lastLoadedAt
              ? `更新 ${formatDateTime(lastLoadedAt.toISOString())}`
              : '尚未加载'
          }}
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

    <section class="filter-panel" aria-label="Audit log filters">
      <label>
        <span>级别</span>
        <select v-model="severity">
          <option value="">全部</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
          <option value="critical">Critical</option>
        </select>
      </label>
      <label>
        <span>事件类型</span>
        <input
          v-model="eventType"
          maxlength="64"
          placeholder="例如 request_failed"
          @keyup.enter="refresh"
        />
      </label>
      <button
        class="filter-button"
        type="button"
        :disabled="loading"
        @click="refresh"
      >
        应用筛选
      </button>
    </section>

    <section v-if="errorMessage" class="error-message" role="status">
      {{ errorMessage }}
    </section>

    <section class="retention-summary" aria-label="Audit log retention">
      <span>每个文件 {{ snapshot?.max_file_bytes ?? 0 }} bytes</span>
      <span>最多保留 {{ snapshot?.retained_file_count ?? 0 }} 个文件</span>
      <span>当前显示 {{ snapshot?.event_count ?? 0 }} 条</span>
    </section>

    <LoadingSkeleton v-if="loading && !snapshot" :lines="6" />

    <section v-else class="log-list" aria-label="Audit log events">
      <p v-if="!events.length" class="empty-state">No audit events</p>
      <article v-for="event in events" :key="event.id" class="log-event">
        <div class="event-title">
          <span class="severity" :class="`severity-${event.severity}`">
            {{ event.severity }}
          </span>
          <strong>{{ event.event_type }}</strong>
          <time>{{ formatDateTime(event.timestamp) }}</time>
        </div>
        <dl class="event-details">
          <div v-if="event.method">
            <dt>Method</dt>
            <dd>{{ event.method }}</dd>
          </div>
          <div v-if="event.route">
            <dt>Route</dt>
            <dd>{{ event.route }}</dd>
          </div>
          <div v-if="event.status_code">
            <dt>Status</dt>
            <dd>{{ event.status_code }}</dd>
          </div>
          <div v-if="event.duration_ms !== undefined">
            <dt>Duration</dt>
            <dd>{{ event.duration_ms }} ms</dd>
          </div>
          <div v-if="event.request_id">
            <dt>Request ID</dt>
            <dd>{{ event.request_id }}</dd>
          </div>
        </dl>
      </article>
    </section>
  </main>
</template>

<style scoped>
.admin-logs-page {
  min-height: 100%;
  padding: var(--space-6);
  color: var(--text-default);
  background: var(--bg-page);
  overflow: auto;
}
.logs-header,
.header-actions,
.filter-panel,
.retention-summary,
.event-title,
.event-details {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.logs-header {
  justify-content: space-between;
  margin-bottom: var(--space-6);
}
.eyebrow,
.summary,
.last-loaded,
.retention-summary,
label span,
time,
dt {
  color: var(--text-secondary);
}
.eyebrow {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-accent);
}
h1,
.summary {
  margin: 0;
}
h1 {
  color: var(--text-strong);
  font-size: var(--font-size-3xl);
}
.summary {
  margin-top: var(--space-2);
}
.refresh-button,
.filter-button {
  min-height: var(--btn-height-default);
  border: 1px solid var(--border-active);
  border-radius: var(--radius-md);
  padding: var(--btn-padding-default);
  color: var(--btn-text-color);
  background: var(--color-brand);
  cursor: pointer;
}
.filter-panel,
.retention-summary,
.log-event,
.error-message {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-component);
}
.filter-panel {
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
  padding: var(--space-4);
}
label {
  display: grid;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
}
select,
input {
  min-height: 36px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-2);
  color: var(--text-strong);
  background: var(--bg-raised);
}
.retention-summary {
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-sm);
}
.error-message {
  margin-bottom: var(--space-4);
  border-color: var(--color-danger);
  padding: var(--space-3) var(--space-4);
  color: var(--color-danger);
}
.log-list {
  display: grid;
  gap: var(--space-3);
}
.log-event {
  padding: var(--space-4);
}
.event-title {
  flex-wrap: wrap;
}
.event-title strong {
  color: var(--text-strong);
}
time {
  margin-left: auto;
  font-size: var(--font-size-sm);
}
.severity {
  min-width: 68px;
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  text-align: center;
  font-size: var(--font-size-sm);
  font-weight: 700;
  background: var(--bg-fill);
}
.severity-warning {
  color: var(--color-warning);
}
.severity-error,
.severity-critical {
  color: var(--color-danger);
}
.severity-info {
  color: var(--color-accent);
}
.event-details {
  flex-wrap: wrap;
  margin: var(--space-3) 0 0;
}
.event-details div {
  display: flex;
  gap: var(--space-1);
  min-width: 0;
  font-size: var(--font-size-sm);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--text-strong);
}
.empty-state {
  margin: 0;
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  color: var(--text-secondary);
  text-align: center;
}
@media (max-width: 720px) {
  .admin-logs-page {
    padding: var(--space-4);
  }
  .logs-header,
  .header-actions {
    align-items: stretch;
    flex-direction: column;
  }
  time {
    width: 100%;
    margin-left: 0;
  }
  .filter-panel label {
    width: 100%;
  }
}
</style>
