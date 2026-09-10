"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  deleteContactFact,
  getContactFacts,
  setContactFactStatus
} from "../lib/api";
import type { MemoryFact } from "../lib/types";

export function useContactFacts(conversationId: number | null) {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeConversationId = useRef(conversationId);
  activeConversationId.current = conversationId;

  const load = useCallback((id: number, signal?: AbortSignal) => {
    getContactFacts(id, signal)
      .then((response) => {
        if (activeConversationId.current === id) {
          setFacts(response.facts);
        }
      })
      .catch(() => {
        // No contact (e.g. a group) or a failed fetch: the section simply stays empty.
      });
  }, []);

  useEffect(() => {
    setFacts([]);
    setError(null);

    if (conversationId === null) {
      return;
    }

    const controller = new AbortController();
    load(conversationId, controller.signal);

    return () => controller.abort();
  }, [conversationId, load]);

  const act = useCallback(
    async (factId: number, action: "confirmed" | "rejected" | "delete") => {
      if (conversationId === null) {
        return;
      }

      const id = conversationId;
      setPending(true);
      setError(null);

      try {
        if (action === "delete") {
          await deleteContactFact(id, factId);
        } else {
          await setContactFactStatus(id, factId, action);
        }

        if (activeConversationId.current === id) {
          load(id);
        }
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Could not update fact";
        if (activeConversationId.current === id) {
          setError(message);
        }
      } finally {
        setPending(false);
      }
    },
    [conversationId, load]
  );

  return { facts, pending, error, act };
}
