import { defineStore } from "pinia";
import { convexClient } from "../convexClient";
import type { EventRecord, IntegrationValidation, RoutingConfig } from "../types";

export type AppState = {
  routing: RoutingConfig | null;
  validations: Record<"twilio" | "intercom", IntegrationValidation | null>;
  events: EventRecord[];
  loading: boolean;
  error: string | null;
};

export const useAppStore = defineStore("app", {
  state: (): AppState => ({
    routing: null,
    validations: { twilio: null, intercom: null },
    events: [],
    loading: false,
    error: null
  }),
  actions: {
    async refresh() {
      this.loading = true;
      this.error = null;
      try {
        this.routing = (await convexClient.query("routing:getActive", {})) as RoutingConfig | null;
        const validations = (await convexClient.query("validations:list", {})) as IntegrationValidation[];
        this.validations = {
          twilio: validations.find((item) => item.integration === "twilio") ?? null,
          intercom: validations.find((item) => item.integration === "intercom") ?? null
        };
        this.events = (await convexClient.query("events:list", { limit: 50 })) as EventRecord[];
      } catch (err) {
        this.error = err instanceof Error ? err.message : "Unknown error";
      } finally {
        this.loading = false;
      }
    }
  }
});
