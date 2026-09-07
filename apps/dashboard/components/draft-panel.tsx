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
  interrupted: "generation was interrupted by a restart"
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

export function DraftPanel({ draft }: { draft: Draft | null }) {
  if (draft === null) {
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

  if (draft.status === "failed") {
    return (
      <div className="border-t border-zinc-800 bg-zinc-950/50 px-4 py-2.5 text-xs text-zinc-500">
        Couldn&apos;t generate a suggestion — {friendlyError(draft.errorKind)}
      </div>
    );
  }

  const latency = formatLatency(draft.latencyMs);

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/50 p-3">
      <div className="rounded-[14px] border border-emerald-800/60 bg-emerald-950/20 px-3.5 py-2.5">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-600">
          AI Suggested Reply
        </p>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-200">
          {draft.generatedText}
        </p>
        <p className="mt-1.5 text-[10px] text-zinc-500">
          {[draft.model, draft.promptVersion, latency].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
  );
}
