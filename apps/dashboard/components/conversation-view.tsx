"use client";

import { useEffect, useRef } from "react";
import { dayKey, formatDateSeparator } from "../lib/format";
import type {
  Contact,
  ContactUpdate,
  Draft,
  MemoryFact,
  MessagePageResponse
} from "../lib/types";
import { ContactSettings } from "./contact-settings";
import { DraftPanel } from "./draft-panel";
import { MessageBubble } from "./message-bubble";

function MessageSkeleton() {
  return (
    <div className="space-y-5 p-4">
      <div className="h-16 w-2/3 animate-pulse rounded-[14px] bg-zinc-900" />
      <div className="ml-auto h-20 w-1/2 animate-pulse rounded-[14px] bg-zinc-900" />
      <div className="h-12 w-1/2 animate-pulse rounded-[14px] bg-zinc-900" />
    </div>
  );
}

export function ConversationView({
  selectedId,
  page,
  error,
  loadingOlder,
  draft,
  draftPending,
  draftActionError,
  contact,
  contactSaving,
  contactError,
  facts,
  factsPending,
  factsError,
  onBack,
  onRetry,
  onLoadOlder,
  onApproveDraft,
  onRegenerateDraft,
  onIgnoreDraft,
  onSaveContact,
  onFactAction
}: {
  selectedId: number | null;
  page: MessagePageResponse | null;
  error: string | null;
  loadingOlder: boolean;
  draft: Draft | null;
  draftPending: boolean;
  draftActionError: string | null;
  contact: Contact | null;
  contactSaving: boolean;
  contactError: string | null;
  facts: MemoryFact[];
  factsPending: boolean;
  factsError: string | null;
  onBack: () => void;
  onRetry: () => void;
  onLoadOlder: () => Promise<void>;
  onApproveDraft: (editedText?: string) => void;
  onRegenerateDraft: () => void;
  onIgnoreDraft: () => void;
  onSaveContact: (patch: ContactUpdate) => void;
  onFactAction: (factId: number, action: "confirmed" | "rejected" | "delete") => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousConversationId = useRef<number | null>(null);
  const previousLastMessageId = useRef<number | null>(null);

  useEffect(() => {
    const lastMessageId = page?.messages.at(-1)?.id ?? null;
    const changedConversation = previousConversationId.current !== selectedId;
    const loadedInitialMessages =
      previousLastMessageId.current === null && lastMessageId !== null;
    const receivedMessage =
      previousLastMessageId.current !== null &&
      lastMessageId !== null &&
      previousLastMessageId.current !== lastMessageId;

    if (
      (changedConversation || loadedInitialMessages || receivedMessage) &&
      scrollRef.current
    ) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }

    previousConversationId.current = selectedId;
    previousLastMessageId.current = lastMessageId;
  }, [page?.messages, selectedId]);

  const loadOlder = async () => {
    const container = scrollRef.current;
    const previousHeight = container?.scrollHeight ?? 0;
    await onLoadOlder();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop += container.scrollHeight - previousHeight;
        }
      });
    });
  };

  if (selectedId === null) {
    return (
      <section className="hidden min-w-0 flex-1 items-center justify-center bg-zinc-950/20 text-sm text-zinc-500 md:flex">
        Select a conversation
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#09090b]">
      <header className="relative flex min-h-14 items-center border-b border-zinc-800 bg-zinc-950/50 px-4">
        <button
          type="button"
          onClick={onBack}
          className="mr-3 rounded px-2 py-1 text-xs font-bold text-zinc-400 hover:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-emerald-500 md:hidden"
        >
          ← Back
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-zinc-50">
            {page?.conversation.title ?? "Loading conversation"}
          </h1>
          {page ? (
            <p className="truncate font-mono text-[10px] text-zinc-500">
              {page.conversation.peerJid ?? page.conversation.externalConversationId}
            </p>
          ) : null}
        </div>
        <ContactSettings
          contact={contact}
          saving={contactSaving}
          error={contactError}
          onSave={onSaveContact}
          facts={facts}
          factsPending={factsPending}
          factsError={factsError}
          onFactAction={onFactAction}
        />
      </header>

      {error ? (
        <div className="flex items-center justify-between gap-3 border-b border-red-950 bg-red-950/30 px-4 py-2 text-xs text-red-300">
          <span>{error}</span>
          <button type="button" onClick={onRetry} className="rounded border border-red-900 px-2 py-1 font-medium hover:bg-red-950">
            Retry
          </button>
        </div>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        {page === null ? <MessageSkeleton /> : null}
        {page?.hasMore ? (
          <div className="mb-5 flex justify-center">
            <button
              type="button"
              disabled={loadingOlder}
              onClick={() => void loadOlder()}
              className="rounded-lg border border-zinc-800 px-4 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-zinc-900 disabled:cursor-wait disabled:opacity-60"
            >
              {loadingOlder ? "Loading…" : "Load older messages"}
            </button>
          </div>
        ) : null}
        {page?.messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">No messages yet</div>
        ) : null}
        <div className="space-y-4">
          {page?.messages.map((message, index) => {
            const previous = page.messages[index - 1];
            const showDate = !previous || dayKey(previous.timestamp) !== dayKey(message.timestamp);

            return (
              <div key={message.id}>
                {showDate ? (
                  <div className="mb-4 flex items-center gap-4 py-2">
                    <span className="h-px flex-1 bg-zinc-900" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                      {formatDateSeparator(message.timestamp)}
                    </span>
                    <span className="h-px flex-1 bg-zinc-900" />
                  </div>
                ) : null}
                <MessageBubble message={message} />
              </div>
            );
          })}
        </div>
      </div>
      <DraftPanel
        draft={draft}
        pending={draftPending}
        actionError={draftActionError}
        onApprove={onApproveDraft}
        onRegenerate={onRegenerateDraft}
        onIgnore={onIgnoreDraft}
      />
    </section>
  );
}
