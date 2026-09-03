export type HealthStatus = {
  status: "ok" | "degraded";
  service: string;
  database: "ok" | "unavailable";
  timestamp: string;
};
