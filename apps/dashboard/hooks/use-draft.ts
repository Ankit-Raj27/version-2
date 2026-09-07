"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDraft } from "../lib/api";
import type { Draft } from "../lib/types";

export function useDraft(conversationId: number | null) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const activeConversationId = useRef(conversationId);
  activeConversationId.current = conversationId;

  const refetch = useCallback(async (signal?: AbortSignal) => {
    if (conversationId === null) {
      return;
    }

    const id = conversationId;

    try {
      const response = await getDraft(id, signal);

      if (activeConversationId.current === id) {
        setDraft(response.draft);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      // A failed draft fetch degrades to "no suggestion shown" — the rest of
      // the dashboard (messages, status) keeps working regardless.
    }
  }, [conversationId]);

  useEffect(() => {
    setDraft(null);

    if (conversationId === null) {
      return;
    }

    const controller = new AbortController();
    void refetch(controller.signal);
    return () => controller.abort();
  }, [conversationId, refetch]);

  return { draft, refetch: () => refetch() };
}
