"use client";

import { useEffect, useState } from "react";
import type { Draft } from "../lib/types";

const ERROR_MESSAGES: Record<string, string> = {
  timeout: "took too long",
  rate_limit: "rate limited",
  auth: "AI not configured",
  bad_request: "request was invalid",
  server: "the AI service had an error",
  network: "network issue",
  invalid_response: "the AI returned something unexpected",
  empty_output: "the AI didn't return a reply",
  interrupted: "generation was interrupted by a restart",
  send_failed: "the WhatsApp send failed"
};

const STALE_REASON_MESSAGES: Record<string, string> = {
  draft_expired: "This suggestion has expired — regenerate to reply.",
  newer_incoming_message: "A newer message has arrived — regenerate to reply.",
  manual_reply_detected: "You already replied to this from your phone.",
  already_replied: "Another reply has already been sent for this message.",
  whatsapp_disconnected: "WhatsApp is not connected.",
  kill_switch_enabled: "Sending is disabled by the kill switch."
};

function friendlyError(errorKind: string | null): string {
  if (!errorKind) {
    return "something went wrong";
  }

  return ERROR_MESSAGES[errorKind] ?? "something went wrong";
}

function formatLatency(latencyMs: number | null): string | null {
  if (latencyMs === null) {
    return null;
  }

  return `${(latencyMs / 1000).toFixed(1)}s`;
}

const buttonClass =
  "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const primaryButtonClass = `${buttonClass} border-emerald-700 bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/70`;
const secondaryButtonClass = `${buttonClass} border-zinc-700 text-zinc-300 hover:bg-zinc-800`;

export function DraftPanel({
  draft,
  pending,
  actionError,
  onApprove,
  onRegenerate,
  onIgnore
}: {
  draft: Draft | null;
  pending: boolean;
  actionError: string | null;
  onApprove: (editedText?: string) => void;
  onRegenerate: () => void;
  onIgnore: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");

  useEffect(() => {
    setIsEditing(false);
    setEditedText(draft?.generatedText ?? "");
  }, [draft?.id]);

  if (draft === null || draft.status === "ignored" || draft.status === "superseded") {
    return null;
  }

  if (draft.status === "generating") {
    return (
      <div className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-950/50 px-4 py-2.5 text-xs text-zinc-500">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" />
        Drafting a reply…
      </div>
    );
  }

  if (draft.status === "sending") {
    return (
      <div className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-950/50 px-4 py-2.5 text-xs text-zinc-500">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" />
        Sending…
      </div>
    );
  }

  if (draft.status === "sent") {
    return (
      <div className="border-t border-zinc-800 bg-zinc-950/50 px-4 py-2.5 text-xs text-emerald-600">
        Sent
      </div>
    );
  }

  if (draft.status === "failed") {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950/50 px-4 py-2.5 text-xs text-zinc-500">
        <span>Couldn&apos;t generate a suggestion — {friendlyError(draft.errorKind)}</span>
        <button
          type="button"
          disabled={pending}
          onClick={onRegenerate}
          className={secondaryButtonClass}
        >
          Regenerate
        </button>
      </div>
    );
  }

  const latency = formatLatency(draft.latencyMs);
  const staleMessage = draft.staleReason ? STALE_REASON_MESSAGES[draft.staleReason] ?? draft.staleReason : null;
  const canSend = draft.sendable && !pending;

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/50 p-3">
      <div className="rounded-[14px] border border-emerald-800/60 bg-emerald-950/20 px-3.5 py-2.5">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-600">
          AI Suggested Reply
        </p>
        {isEditing ? (
          <textarea
            value={editedText}
            onChange={(event) => setEditedText(event.target.value)}
            rows={3}
            maxLength={2000}
            disabled={pending}
            className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm leading-relaxed text-zinc-200 focus-visible:outline-2 focus-visible:outline-emerald-500"
          />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-200">
            {draft.generatedText}
          </p>
        )}
        <p className="mt-1.5 text-[10px] text-zinc-500">
          {[draft.model, draft.promptVersion, latency].filter(Boolean).join(" · ")}
        </p>

        {draft.errorKind ? (
          <p className="mt-2 text-[11px] text-red-400">Send failed — {friendlyError(draft.errorKind)}</p>
        ) : null}
        {!draft.errorKind && staleMessage ? (
          <p className="mt-2 text-[11px] text-amber-400">{staleMessage}</p>
        ) : null}
        {actionError ? <p className="mt-2 text-[11px] text-red-400">{actionError}</p> : null}

        <div className="mt-2.5 flex flex-wrap gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                disabled={!canSend || editedText.trim().length === 0}
                onClick={() => onApprove(editedText)}
                className={primaryButtonClass}
              >
                Send edited
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setIsEditing(false)}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={!canSend}
                onClick={() => onApprove()}
                className={primaryButtonClass}
              >
                Send
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setIsEditing(true)}
                className={secondaryButtonClass}
              >
                Edit
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={onRegenerate}
                className={secondaryButtonClass}
              >
                Regenerate
              </button>
              <button type="button" disabled={pending} onClick={onIgnore} className={secondaryButtonClass}>
                Ignore
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
