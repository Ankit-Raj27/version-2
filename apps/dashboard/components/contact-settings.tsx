"use client";

import { useEffect, useState } from "react";
import type {
  Contact,
  ContactUpdate,
  MemoryFact,
  Relationship,
  ReplyMode
} from "../lib/types";
import { RELATIONSHIPS, SELECTABLE_REPLY_MODES } from "../lib/types";

const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  UNKNOWN: "Unknown",
  FAMILY: "Family",
  FRIEND: "Friend",
  WORK: "Work",
  ACQUAINTANCE: "Acquaintance",
  OTHER: "Other"
};

const REPLY_MODE_LABELS: Record<ReplyMode, string> = {
  OFF: "Off — no AI drafts",
  DRAFT: "Draft — AI suggests, you approve",
  AUTO_SAFE: "Auto (safe) — coming later",
  AUTO: "Auto — coming later"
};

const fieldClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 focus-visible:outline-2 focus-visible:outline-emerald-500";

export function ContactSettings({
  contact,
  saving,
  error,
  onSave,
  facts,
  factsPending,
  factsError,
  onFactAction
}: {
  contact: Contact | null;
  saving: boolean;
  error: string | null;
  onSave: (patch: ContactUpdate) => void;
  facts: MemoryFact[];
  factsPending: boolean;
  factsError: string | null;
  onFactAction: (factId: number, action: "confirmed" | "rejected" | "delete") => void;
}) {
  const [relationship, setRelationship] = useState<Relationship>("UNKNOWN");
  const [replyMode, setReplyMode] = useState<ReplyMode>("OFF");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setRelationship(contact?.relationship ?? "UNKNOWN");
    setReplyMode(contact?.replyMode ?? "OFF");
    setNotes(contact?.notes ?? "");
  }, [contact?.id, contact?.relationship, contact?.replyMode, contact?.notes]);

  if (!contact) {
    return null;
  }

  const trimmedNotes = notes.trim();
  const dirty =
    relationship !== contact.relationship ||
    replyMode !== contact.replyMode ||
    trimmedNotes !== (contact.notes ?? "");

  // AUTO_SAFE / AUTO are not user-selectable in Phase 7, but if a contact somehow
  // already holds one, keep it visible (disabled) rather than silently dropping it.
  const replyModeOptions: ReplyMode[] = SELECTABLE_REPLY_MODES.includes(replyMode)
    ? SELECTABLE_REPLY_MODES
    : [...SELECTABLE_REPLY_MODES, replyMode];

  const submit = () => {
    onSave({
      relationship,
      replyMode,
      notes: trimmedNotes.length > 0 ? trimmedNotes : null
    });
  };

  return (
    <details className="group ml-auto text-xs text-zinc-400">
      <summary className="cursor-pointer select-none rounded px-2 py-1 font-medium hover:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-emerald-500">
        Contact settings
      </summary>
      <div className="absolute right-4 z-10 mt-2 w-72 space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-xl">
        <label className="block space-y-1">
          <span className="font-semibold uppercase tracking-widest text-zinc-500 text-[10px]">
            Relationship
          </span>
          <select
            value={relationship}
            disabled={saving}
            onChange={(event) => setRelationship(event.target.value as Relationship)}
            className={fieldClass}
          >
            {RELATIONSHIPS.map((value) => (
              <option key={value} value={value}>
                {RELATIONSHIP_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="font-semibold uppercase tracking-widest text-zinc-500 text-[10px]">
            Reply mode
          </span>
          <select
            value={replyMode}
            disabled={saving}
            onChange={(event) => setReplyMode(event.target.value as ReplyMode)}
            className={fieldClass}
          >
            {replyModeOptions.map((value) => (
              <option
                key={value}
                value={value}
                disabled={!SELECTABLE_REPLY_MODES.includes(value)}
              >
                {REPLY_MODE_LABELS[value]}
              </option>
            ))}
          </select>
          <span className="block text-[10px] text-zinc-600">
            Automatic sending is not available. Draft replies always wait for your approval.
          </span>
        </label>

        <label className="block space-y-1">
          <span className="font-semibold uppercase tracking-widest text-zinc-500 text-[10px]">
            Notes
          </span>
          <textarea
            value={notes}
            disabled={saving}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            maxLength={2000}
            className={`${fieldClass} resize-none`}
          />
        </label>

        {error ? <p className="text-[11px] text-red-400">{error}</p> : null}

        <button
          type="button"
          disabled={!dirty || saving}
          onClick={submit}
          className="rounded-lg border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-900/70 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>

        <MemoryFacts
          facts={facts}
          pending={factsPending}
          error={factsError}
          onAct={onFactAction}
        />
      </div>
    </details>
  );
}

function MemoryFacts({
  facts,
  pending,
  error,
  onAct
}: {
  facts: MemoryFact[];
  pending: boolean;
  error: string | null;
  onAct: (factId: number, action: "confirmed" | "rejected" | "delete") => void;
}) {
  const proposed = facts.filter((fact) => fact.status === "proposed");
  const confirmed = facts.filter((fact) => fact.status === "confirmed");

  if (facts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 border-t border-zinc-800 pt-3">
      <span className="block font-semibold uppercase tracking-widest text-zinc-500 text-[10px]">
        What the AI remembers
      </span>

      {proposed.length > 0 ? (
        <div className="space-y-1.5">
          <span className="block text-[10px] text-amber-500">
            Suggested — not used until you confirm
          </span>
          {proposed.map((fact) => (
            <div
              key={fact.id}
              className="space-y-1 rounded-md border border-amber-900/60 bg-amber-950/20 p-2"
            >
              <p className="text-[11px] text-zinc-300">{fact.fact}</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onAct(fact.id, "confirmed")}
                  className="rounded border border-emerald-800 px-2 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-40"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onAct(fact.id, "rejected")}
                  className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-900 disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {confirmed.length > 0 ? (
        <ul className="space-y-1">
          {confirmed.map((fact) => (
            <li key={fact.id} className="flex items-start gap-2">
              <span className="flex-1 text-[11px] text-zinc-400">{fact.fact}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => onAct(fact.id, "delete")}
                className="text-[10px] text-zinc-600 hover:text-red-400 disabled:opacity-40"
              >
                Forget
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
    </div>
  );
}
