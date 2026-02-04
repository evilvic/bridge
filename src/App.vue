<template>
  <div class="shell">
    <header class="topbar">
      <div>
        <div class="title">Bridge Console</div>
        <div class="subtitle">PoC: Twilio WhatsApp <-> Intercom</div>
      </div>
      <div class="env">ENV: POC</div>
    </header>

    <main class="grid">
      <section class="card">
        <h2>Overview</h2>
        <div v-if="store.error" class="error-banner">{{ store.error }}</div>
        <div class="row">
          <div class="label">Twilio validation</div>
          <div class="value">
            <span :class="statusClass(store.validations.twilio?.status)">
              {{ store.validations.twilio?.status ?? "unknown" }}
            </span>
          </div>
        </div>
        <div class="row">
          <div class="label">Intercom validation</div>
          <div class="value">
            <span :class="statusClass(store.validations.intercom?.status)">
              {{ store.validations.intercom?.status ?? "unknown" }}
            </span>
          </div>
        </div>
        <div class="row">
          <div class="label">Last event</div>
          <div class="value">
            {{ store.events[0]?.timestamp ?? "No events yet" }}
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Config</h2>
        <div class="row">
          <div class="label">number_to</div>
          <div class="value monospace">
            {{ store.routing?.number_to ?? "Not set" }}
          </div>
        </div>
        <div class="row">
          <div class="label">intercom_workspace_id</div>
          <div class="value monospace">
            {{ store.routing?.intercom_workspace_id ?? "Not set" }}
          </div>
        </div>
        <div class="row">
          <div class="label">enabled</div>
          <div class="value">
            {{ store.routing?.enabled ?? false }}
          </div>
        </div>
        <div class="actions">
          <button class="primary" disabled>Save</button>
          <button class="secondary" disabled>Validate</button>
        </div>
        <div class="hint">Config actions are wired once Convex queries are connected.</div>
      </section>

      <section class="card wide">
        <h2>Events</h2>
        <div v-if="store.events.length === 0" class="empty">No events yet.</div>
        <div v-else class="events">
          <div v-for="event in store.events" :key="event.idempotency_key" class="event-row">
            <div class="event-main">
              <div class="event-title">
                {{ event.direction }} - {{ event.status }}
              </div>
              <div class="event-meta monospace">
                {{ event.timestamp }} - {{ event.number_to }}
              </div>
            </div>
            <div class="event-status" :class="statusClass(event.status)">
              {{ event.status }}
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Setup checklist</h2>
        <ol class="checklist">
          <li>Set RoutingConfig (number_to, intercom_workspace_id).</li>
          <li>Configure Twilio webhook URL.</li>
          <li>Configure Intercom webhook URL.</li>
          <li>Run Validate for Twilio and Intercom.</li>
        </ol>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useAppStore } from "./stores/app";

const store = useAppStore();

onMounted(() => {
  void store.refresh();
});

const statusClass = (status?: string) => {
  if (status === "ok") return "status ok";
  if (status === "failed") return "status failed";
  if (status === "retrying") return "status warn";
  if (status === "queued") return "status info";
  return "status unknown";
};
</script>

<style scoped>
.shell {
  min-height: 100vh;
  padding: 24px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.error-banner {
  background: #fee2e2;
  color: #b91c1c;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  margin-bottom: 12px;
}

.title {
  font-size: 20px;
  font-weight: 700;
}

.subtitle {
  font-size: 13px;
  color: #475569;
}

.env {
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 999px;
  background: #e2e8f0;
}

.grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.card {
  background: #ffffff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
}

.card.wide {
  grid-column: 1 / -1;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #e2e8f0;
}

.row:last-of-type {
  border-bottom: none;
}

.label {
  color: #64748b;
  font-size: 13px;
}

.value {
  font-size: 13px;
  font-weight: 600;
}

.monospace {
  font-family: "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
}

.actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

button {
  border: none;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: not-allowed;
}

button.primary {
  background: #2563eb;
  color: #ffffff;
}

button.secondary {
  background: #e2e8f0;
  color: #0f172a;
}

.hint {
  margin-top: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.empty {
  font-size: 13px;
  color: #94a3b8;
}

.events {
  display: grid;
  gap: 8px;
}

.event-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

.event-title {
  font-size: 13px;
  font-weight: 600;
}

.event-meta {
  font-size: 12px;
  color: #64748b;
}

.status {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  text-transform: uppercase;
}

.status.ok {
  background: #dcfce7;
  color: #166534;
}

.status.failed {
  background: #fee2e2;
  color: #b91c1c;
}

.status.warn {
  background: #fef9c3;
  color: #92400e;
}

.status.info {
  background: #dbeafe;
  color: #1d4ed8;
}

.status.unknown {
  background: #e2e8f0;
  color: #475569;
}

.checklist {
  padding-left: 18px;
  margin: 8px 0 0;
  color: #475569;
  font-size: 13px;
}
</style>
