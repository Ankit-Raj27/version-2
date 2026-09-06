import type { StreamState, SystemStatus } from "../lib/types";

function StatusItem({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "healthy" | "warning" | "error";
}) {
  const dotClass = {
    healthy: "bg-emerald-500",
    warning: "bg-amber-500",
    error: "bg-red-500"
  }[tone];

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
        {label}: {value}
      </span>
    </div>
  );
}

export function StatusBar({
  status,
  streamState
}: {
  status: SystemStatus | null;
  streamState: StreamState;
}) {
  const whatsappState = status?.whatsapp.state ?? "unavailable";
  const whatsappTone = status?.whatsapp.connected
    ? "healthy"
    : whatsappState === "logged_out"
      ? "error"
      : "warning";
  const databaseState = status?.database ?? "unavailable";

  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-zinc-800 bg-zinc-950 px-4 py-2">
      <span className="mr-auto text-sm font-semibold tracking-tight text-zinc-50">
        Personal AI
      </span>
      <StatusItem label="WhatsApp" value={whatsappState} tone={whatsappTone} />
      <StatusItem
        label="DB"
        value={databaseState}
        tone={databaseState === "ok" ? "healthy" : "error"}
      />
      <StatusItem
        label="Stream"
        value={streamState}
        tone={streamState === "live" ? "healthy" : "warning"}
      />
      {whatsappState === "qr" ? (
        <span className="w-full text-right text-[11px] text-amber-400">
          Scan QR in terminal
        </span>
      ) : null}
    </header>
  );
}
