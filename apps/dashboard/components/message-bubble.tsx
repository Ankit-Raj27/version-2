import { formatMessageTime } from "../lib/format";
import type { MessageView } from "../lib/types";

export function MessageBubble({ message }: { message: MessageView }) {
  const outgoing = message.direction === "outgoing";
  const showOrigin = message.origin !== "CONTACT" && message.origin !== "USER_PHONE";

  return (
    <div className={`flex w-full ${outgoing ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%] sm:max-w-[70%]">
        {!outgoing && message.senderLabel ? (
          <p className="mb-1 px-1 text-[11px] font-medium text-zinc-500">
            {message.senderLabel}
          </p>
        ) : null}
        <div
          className={`rounded-[14px] border px-3.5 py-2.5 ${
            outgoing
              ? "rounded-tr-none border-emerald-800/60 bg-emerald-950/40"
              : "rounded-tl-none border-zinc-800 bg-zinc-900"
          }`}
        >
          {message.quotedPreview ? (
            <div className={`mb-2 rounded-sm border-l-2 p-2 ${outgoing ? "border-emerald-800 bg-black/20" : "border-zinc-600 bg-zinc-950/60"}`}>
              <p className="line-clamp-2 text-[11px] text-zinc-400">
                {message.quotedPreview}
              </p>
            </div>
          ) : null}
          {message.type === "unsupported" ? (
            <p className="text-xs italic text-zinc-500">Unsupported message</p>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-200">
              {message.text}
            </p>
          )}
          <div className="mt-1 flex items-center justify-end gap-2">
            {showOrigin ? (
              <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                {message.origin}
              </span>
            ) : null}
            <time
              dateTime={message.timestamp}
              title={message.timestamp}
              className={outgoing ? "text-[10px] text-emerald-800" : "text-[10px] text-zinc-500"}
            >
              {formatMessageTime(message.timestamp)}
            </time>
          </div>
        </div>
      </div>
    </div>
  );
}
