"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, approveDraft, getDraft, ignoreDraft, regenerateDraft } from "../lib/api";
import type { Draft } from "../lib/types";

export function useDraft(conversationId: number | null) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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
    setActionError(null);

    if (conversationId === null) {
      return;
    }

    const controller = new AbortController();
    void refetch(controller.signal);
    return () => controller.abort();
  }, [conversationId, refetch]);

  const runAction = useCallback(
    async (action: (id: number, draftId: number) => Promise<{ draft: Draft | null }>) => {
      if (conversationId === null || draft === null) {
        return;
      }

      setPending(true);
      setActionError(null);

      try {
        const response = await action(conversationId, draft.id);

        if (activeConversationId.current === conversationId) {
          setDraft(response.draft);
        }
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Something went wrong";

        if (activeConversationId.current === conversationId) {
          setActionError(message);
        }
      } finally {
        setPending(false);
      }
    },
    [conversationId, draft]
  );

  const approve = useCallback(
    (editedText?: string) => runAction((id, draftId) => approveDraft(id, draftId, editedText)),
    [runAction]
  );
  const regenerate = useCallback(() => runAction(regenerateDraft), [runAction]);
  const ignore = useCallback(() => runAction(ignoreDraft), [runAction]);

  return { draft, pending, actionError, refetch: () => refetch(), approve, regenerate, ignore };
}
