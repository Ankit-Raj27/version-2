"use client";

import { useCallback, useMemo, useState } from "react";
import { useAppEvents } from "../hooks/use-app-events";
import { useContact } from "../hooks/use-contact";
import { useConversations } from "../hooks/use-conversations";
import { useDraft } from "../hooks/use-draft";
import { useMessages } from "../hooks/use-messages";
import { useSystemStatus } from "../hooks/use-system-status";
import type { DraftStatus, WhatsAppConnectionState } from "../lib/types";
import { ConversationList } from "./conversation-list";
import { ConversationView } from "./conversation-view";
import { StatusBar } from "./status-bar";

export function Dashboard() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [unreadIds, setUnreadIds] = useState<Set<number>>(() => new Set());
  const conversations = useConversations();
  const messages = useMessages(selectedId);
  const draft = useDraft(selectedId);
  const contact = useContact(selectedId);
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
      onDraftUpdated: (event: {
        conversationId: number;
        draftId: number;
        status: DraftStatus;
      }) => {
        if (event.conversationId === selectedId) {
          void draft.refetch();
        }
      },
      onOpen: () => {
        void conversations.refetch();
        void messages.refetch();
        void draft.refetch();
        void system.refetch();
      }
    }),
    [
      conversations.refetch,
      draft.refetch,
      messages.refetch,
      selectedId,
      system.refetch,
      system.updateWhatsApp
    ]
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
          draft={draft.draft}
          draftPending={draft.pending}
          draftActionError={draft.actionError}
          contact={contact.contact}
          contactSaving={contact.saving}
          contactError={contact.error}
          onBack={() => setSelectedId(null)}
          onRetry={() => void messages.refetch()}
          onLoadOlder={messages.loadOlder}
          onApproveDraft={draft.approve}
          onRegenerateDraft={draft.regenerate}
          onIgnoreDraft={draft.ignore}
          onSaveContact={contact.save}
        />
      </div>
    </main>
  );
}
