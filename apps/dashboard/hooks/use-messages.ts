"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMessages } from "../lib/api";
import type { MessagePageResponse, MessageView } from "../lib/types";

function mergeMessages(current: MessageView[], incoming: MessageView[]): MessageView[] {
  const byId = new Map(current.map((message) => [message.id, message]));

  for (const message of incoming) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort((left, right) => {
    const timestampDifference =
      new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
    return timestampDifference || left.id - right.id;
  });
}

export function useMessages(conversationId: number | null) {
  const [page, setPage] = useState<MessagePageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const activeConversationId = useRef(conversationId);
  activeConversationId.current = conversationId;

  const loadInitial = useCallback(async (id: number, signal?: AbortSignal) => {
    try {
      const response = await getMessages(id, null, signal);

      if (activeConversationId.current === id) {
        setPage(response);
        setError(null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      if (activeConversationId.current === id) {
        setError(err instanceof Error ? err.message : "Cannot load messages");
      }
    }
  }, []);

  useEffect(() => {
    setPage(null);
    setError(null);

    if (conversationId === null) {
      return;
    }

    const controller = new AbortController();
    void loadInitial(conversationId, controller.signal);
    return () => controller.abort();
  }, [conversationId, loadInitial]);

  const refetch = useCallback(async () => {
    if (conversationId === null) {
      return;
    }

    const id = conversationId;

    try {
      const response = await getMessages(id);

      if (activeConversationId.current !== id) {
        return;
      }

      setPage((current) =>
        current && current.conversation.id === response.conversation.id
          ? {
              ...response,
              messages: mergeMessages(current.messages, response.messages),
              hasMore: current.hasMore,
              oldest: current.oldest
            }
          : response
      );
      setError(null);
    } catch (err) {
      if (activeConversationId.current === id) {
        setError(err instanceof Error ? err.message : "Cannot load messages");
      }
    }
  }, [conversationId]);

  const loadOlder = useCallback(async () => {
    if (conversationId === null || !page?.hasMore || !page.oldest) {
      return;
    }

    const id = conversationId;
    setLoadingOlder(true);
    try {
      const older = await getMessages(id, page.oldest);

      if (activeConversationId.current !== id) {
        return;
      }

      setPage((current) =>
        current?.conversation.id === id
          ? {
              ...current,
              messages: mergeMessages(older.messages, current.messages),
              hasMore: older.hasMore,
              oldest: older.oldest
            }
          : older
      );
      setError(null);
    } catch (err) {
      if (activeConversationId.current === id) {
        setError(err instanceof Error ? err.message : "Cannot load older messages");
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, page?.hasMore, page?.oldest]);

  return { page, error, loadingOlder, refetch, loadOlder };
}
