import { formatConversationTime, initials } from "../lib/format";
import type { ConversationSummary } from "../lib/types";

function SkeletonRows() {
  return Array.from({ length: 3 }, (_, index) => (
    <div key={index} className="flex animate-pulse gap-3 border-b border-zinc-900 p-3">
      <div className="h-11 w-11 shrink-0 rounded-full bg-zinc-900" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-3 w-2/5 rounded bg-zinc-900" />
        <div className="h-2 w-4/5 rounded bg-zinc-900" />
      </div>
    </div>
  ));
}

export function ConversationList({
  conversations,
  selectedId,
  unreadIds,
  error,
  onSelect,
  onRetry
}: {
  conversations: ConversationSummary[] | null;
  selectedId: number | null;
  unreadIds: ReadonlySet<number>;
  error: string | null;
  onSelect: (id: number) => void;
  onRetry: () => void;
}) {
  return (
    <aside
      className={`${selectedId === null ? "flex" : "hidden"} w-full shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 md:flex md:w-[340px]`}
    >
      <div className="flex h-12 items-center justify-between border-b border-zinc-800 px-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Conversations
        </h2>
        {conversations ? (
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
            {conversations.length} total
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="border-b border-red-950 bg-red-950/30 p-3 text-xs text-red-300">
          <p>{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded border border-red-900 px-2 py-1 font-medium hover:bg-red-950"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations === null ? <SkeletonRows /> : null}
        {conversations?.length === 0 ? (
          <div className="p-6 text-center text-sm leading-6 text-zinc-500">
            No conversations yet. Send yourself a WhatsApp message.
          </div>
        ) : null}
        {conversations?.map((conversation) => {
          const selected = conversation.id === selectedId;
          const unread = unreadIds.has(conversation.id);
          const preview = conversation.lastMessagePreview ?? "No messages yet";

          return (
            <button
              type="button"
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              className={`relative flex w-full gap-3 border-b border-zinc-900 p-3 text-left transition-colors hover:bg-zinc-900/60 focus-visible:outline-2 focus-visible:outline-emerald-500 ${
                selected ? "bg-zinc-900" : ""
              }`}
            >
              {selected ? (
                <span className="absolute inset-y-0 left-0 w-0.5 bg-emerald-500" />
              ) : null}
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs font-bold text-zinc-500">
                {initials(conversation.title)}
                {unread ? (
                  <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-zinc-950 bg-emerald-500" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="mb-0.5 flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-zinc-50">
                      {conversation.title}
                    </span>
                    {conversation.type === "group" ? (
                      <span className="rounded bg-zinc-800 px-1 text-[9px] font-bold text-zinc-500">
                        GRP
                      </span>
                    ) : null}
                  </span>
                  <time className={`shrink-0 text-[10px] ${unread ? "font-semibold text-emerald-500" : "text-zinc-500"}`}>
                    {formatConversationTime(conversation.lastMessageAt)}
                  </time>
                </span>
                <span className={`block truncate text-xs ${unread ? "font-medium text-zinc-300" : "text-zinc-500"}`}>
                  {conversation.lastMessageDirection === "outgoing" ? "→ " : ""}
                  {preview}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
