"use client";

import { useCallback, useEffect, useState } from "react";
import { getSystemStatus } from "../lib/api";
import type { SystemStatus, WhatsAppConnectionState } from "../lib/types";

export function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (signal?: AbortSignal) => {
    try {
      setStatus(await getSystemStatus(signal));
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      setError(err instanceof Error ? err.message : "Cannot reach server");
    }
  }, []);

  const updateWhatsApp = useCallback(
    (whatsapp: { state: WhatsAppConnectionState; connected: boolean }) => {
      setStatus((current) =>
        current
          ? { ...current, whatsapp, timestamp: new Date().toISOString() }
          : {
              server: "ok",
              database: "unavailable",
              whatsapp,
              timestamp: new Date().toISOString()
            }
      );
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    void refetch(controller.signal);
    return () => controller.abort();
  }, [refetch]);

  return { status, error, refetch, updateWhatsApp };
}
