"use client";

import { useCallback, useEffect, useState } from "react";
import { getConversations } from "../lib/api";
import type { ConversationSummary } from "../lib/types";

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await getConversations(signal);
      setConversations(response.conversations);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      setError(err instanceof Error ? err.message : "Cannot reach server");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refetch(controller.signal);
    return () => controller.abort();
  }, [refetch]);

  return { conversations, error, refetch };
}
