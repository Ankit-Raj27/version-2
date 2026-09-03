export const dynamic = "force-dynamic";

type Health = {
  status: string;
  service: string;
  database: string;
  timestamp: string;
};

async function loadHealth(): Promise<Health | null> {
  const baseUrl = process.env.SERVER_BASE_URL ?? "http://127.0.0.1:3001";

  try {
    const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as Health;
  } catch {
    return null;
  }
}

export default async function Home() {
  const health = await loadHealth();
  const healthy = health?.status === "ok" && health.database === "ok";

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-2xl">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Phase 0</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Personal AI Foundation</h1>
        <p className="mt-4 max-w-2xl text-zinc-400">
          Modular monolith foundation only. WhatsApp transport remains disabled until Phase 0 acceptance passes.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatusCard label="Dashboard" value="ready" ok />
          <StatusCard label="Server" value={healthy ? "ready" : "offline"} ok={healthy} />
          <StatusCard label="SQLite" value={healthy ? "ready" : "unavailable"} ok={healthy} />
        </div>
      </section>
    </main>
  );
}

function StatusCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-2 flex items-center gap-2 text-lg font-medium">
        <span className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} />
        {value}
      </div>
    </div>
  );
}
