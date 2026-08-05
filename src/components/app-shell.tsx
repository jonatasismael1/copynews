import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3,
  FileText,
  Home,
  LogOut,
  Menu,
  Newspaper,
  PlusCircle,
  Settings,
  Users,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { ProfileAvatar } from "./profile-avatar";
import { PwaInstallButton } from "./pwa-install";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

const items = [
  ["/", "Visão geral", Home],
  ["/noticias", "Notícias", Newspaper],
  ["/criar", "Criar notícia", PlusCircle],
  ["/publicacoes", "Publicações", FileText],
  ["/usuarios", "Usuários", Users],
  ["/configuracoes", "Configurações", Settings],
] as const;

const mobileLabels: Record<(typeof items)[number][0], string> = {
  "/": "Visão",
  "/noticias": "Notícias",
  "/criar": "Criar",
  "/publicacoes": "Posts",
  "/usuarios": "Usuários",
  "/configuracoes": "Ajustes",
};

export function AppShell() {
  const [open, setOpen] = useState(false);
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const isCreatePage = location.pathname === "/criar";
  const isDesignEditor = /^\/noticias\/[^/]+\/arte$/.test(location.pathname);
  const visibleItems = items.filter(
    ([path]) => path !== "/usuarios" || profile?.role === "admin",
  );
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[min(20rem,88vw)] border-r border-white/10 bg-sidebar p-4 text-white shadow-2xl transition-transform duration-200 lg:w-64 lg:translate-x-0 lg:shadow-none",
          isDesignEditor && "hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-[10px] bg-primary text-primary-foreground">
              <BarChart3 size={20} />
            </div>
            <div>
              <p className="font-display text-lg font-bold leading-none">
                Copy News
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[.18em] text-slate-400">
                Central editorial
              </p>
            </div>
          </div>
          <Button
            className="lg:hidden"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
          >
            <X />
          </Button>
        </div>
        <nav className="mt-5 space-y-1">
          {visibleItems.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors",
                  path === "/configuracoes" ? "flex" : "hidden lg:flex",
                  isActive
                    ? "bg-primary/25 text-white"
                    : "text-slate-300 hover:bg-white/8 hover:text-white",
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] border-t border-white/10 pt-4">
          <div className="mb-3 flex min-w-0 items-center gap-3">
            <ProfileAvatar
              src={profile?.avatar_url}
              name={profile?.name}
              className="size-10"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{profile?.name}</p>
              <p className="truncate text-xs text-slate-400">
                {profile?.email}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-slate-300 hover:bg-white/8 hover:text-white"
            onClick={signOut}
          >
            <LogOut />
            Sair
          </Button>
        </div>
      </aside>
      {open && (
        <button
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[1px] lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Fechar menu"
        />
      )}
      <main
        className={cn(
          "pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:ml-64 lg:pb-0",
          isDesignEditor && "pb-0 lg:ml-0",
        )}
      >
        <header
          className={cn(
            "sticky top-0 z-30 h-14 items-center justify-between border-b bg-card/95 px-2 backdrop-blur-xl sm:px-6",
            isCreatePage || isDesignEditor ? "hidden" : "flex",
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu />
          </Button>
          <div className="hidden lg:block">
            <p className="text-xs font-medium uppercase tracking-[.18em] text-muted-foreground">
              {new Intl.DateTimeFormat("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              }).format(new Date())}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button asChild size="sm" className="hidden lg:inline-flex">
              <Link to="/criar"><PlusCircle size={16} />Nova notícia</Link>
            </Button>
            <PwaInstallButton compact />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Olá, <b className="text-foreground">{profile?.name?.split(" ")[0]}</b>
            </span>
            <ProfileAvatar
              src={profile?.avatar_url}
              name={profile?.name}
              className="size-8"
            />
          </div>
        </header>
        <div
          key={location.pathname}
          className={cn(
            "animate-in overflow-x-hidden px-4 py-5 sm:px-6 sm:py-7",
            isDesignEditor && "p-0 sm:p-0",
          )}
        >
          <Outlet />
        </div>
      </main>
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 flex h-[calc(68px+env(safe-area-inset-bottom))] items-start justify-around border-t bg-card/98 px-1 pt-1 shadow-[0_-4px_16px_rgb(16_24_40/4%)] backdrop-blur lg:hidden",
          isDesignEditor && "hidden",
        )}
      >
        {visibleItems.slice(0, 5).map(([path, , Icon]) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            className={({ isActive }) =>
              cn(
                "flex min-h-[60px] min-w-14 flex-col items-center justify-center gap-1 rounded-[10px] px-1 py-1.5 text-xs font-medium",
                isActive ? "text-primary" : "text-muted-foreground",
              )
            }
          >
            <Icon size={22} />
            <span>{mobileLabels[path]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
