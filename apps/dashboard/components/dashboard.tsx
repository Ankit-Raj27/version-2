"use client";

import { useCallback, useMemo, useState } from "react";
import { useAppEvents } from "../hooks/use-app-events";
import { useConversations } from "../hooks/use-conversations";
import { useMessages } from "../hooks/use-messages";
import { useSystemStatus } from "../hooks/use-system-status";
import type { WhatsAppConnectionState } from "../lib/types";
import { ConversationList } from "./conversation-list";
import { ConversationView } from "./conversation-view";
import { StatusBar } from "./status-bar";

export function Dashboard() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [unreadIds, setUnreadIds] = useState<Set<number>>(() => new Set());
  const conversations = useConversations();
  const messages = useMessages(selectedId);
  const system = useSystemStatus();

  const selectConversation = useCallback((id: number) => {
    setSelectedId(id);
    setUnreadIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const eventCallbacks = useMemo(
    () => ({
      onMessageCreated: (event: { conversationId: number; messageId: number }) => {
        void conversations.refetch();
        if (event.conversationId === selectedId) {
          void messages.refetch();
        } else {
          setUnreadIds((current) => new Set(current).add(event.conversationId));
        }
      },
      onStatus: (event: { state: WhatsAppConnectionState; connected: boolean }) => {
        system.updateWhatsApp(event);
      },
      onOpen: () => {
        void conversations.refetch();
        void messages.refetch();
        void system.refetch();
      }
    }),
    [conversations.refetch, messages.refetch, selectedId, system.refetch, system.updateWhatsApp]
  );
  const streamState = useAppEvents(eventCallbacks);
  const backendError = conversations.error && !conversations.conversations;

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#09090b] text-zinc-50">
      <StatusBar status={system.status} streamState={streamState} />
      {backendError ? (
        <div className="border-b border-red-950 bg-red-950/30 px-4 py-2 text-center text-xs text-red-300">
          Cannot reach server. Dashboard will retry when connection returns.
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ConversationList
          conversations={conversations.conversations}
          selectedId={selectedId}
          unreadIds={unreadIds}
          error={conversations.error}
          onSelect={selectConversation}
          onRetry={() => void conversations.refetch()}
        />
        <ConversationView
          selectedId={selectedId}
          page={messages.page}
          error={messages.error}
          loadingOlder={messages.loadingOlder}
          onBack={() => setSelectedId(null)}
          onRetry={() => void messages.refetch()}
          onLoadOlder={messages.loadOlder}
        />
      </div>
    </main>
  );
}
