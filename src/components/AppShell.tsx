"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";

const NAV = [
  { href: "/", label: "Painel", icon: "▦" },
  { href: "/leads", label: "Leads", icon: "☰" },
  { href: "/leads/novo", label: "Novo", icon: "＋" },
  { href: "/importar", label: "Importar", icon: "⇪" },
  { href: "/config", label: "Config", icon: "⚙" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { error, refresh, notice, dismissNotice, clearError } = useStore();
  const active = (h: string) => (h === "/" ? path === "/" : path === h || (h === "/leads" && path.startsWith("/leads/") && path !== "/leads/novo"));

  return (
    <div className="min-h-screen md:pl-56">
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-zinc-200 bg-white p-4 md:flex">
        <div className="mb-6 text-lg font-semibold">Prospect CRM</div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${active(n.href) ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"}`}
            >
              <span className="mr-2">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>

      {error && (
        <div className="flex items-center justify-between gap-3 bg-rose-100 px-4 py-2 text-sm text-rose-900" role="alert">
          <span>
            {error === "unauthorized"
              ? "Acesso não autorizado. Entre pelo Cloudflare Access com o e-mail autorizado."
              : error === "save"
                ? "Não foi possível salvar a última alteração. Os dados foram recarregados."
                : "Sem conexão com o servidor."}
          </span>
          <button className="shrink-0 font-semibold underline" onClick={() => { clearError(); void refresh(); }}>Fechar e recarregar</button>
        </div>
      )}

      {notice && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-2 text-sm ${notice.kind === "success" ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          <span>{notice.text}</span>
          <button className="shrink-0 font-semibold underline" onClick={dismissNotice}>Fechar</button>
        </div>
      )}

      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 md:pb-10 md:pt-8">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-xs ${active(n.href) ? "font-semibold text-emerald-700" : "text-zinc-500"}`}
          >
            <span className="text-lg leading-none">{n.icon}</span>
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
