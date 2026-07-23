import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
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
  const visibleItems = items.filter(
    ([path]) => path !== "/usuarios" || profile?.role === "admin",
  );
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[min(18rem,88vw)] border-r bg-sidebar p-4 transition-transform lg:w-72 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <BarChart3 size={20} />
            </div>
            <div>
              <p className="font-display text-lg font-bold leading-none">
                Copy News
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[.22em] text-muted-foreground">
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
        <nav className="mt-6 space-y-1">
          {visibleItems.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] rounded-2xl border bg-background/70 p-3">
          <div className="mb-3 flex min-w-0 items-center gap-3">
            <ProfileAvatar
              src={profile?.avatar_url}
              name={profile?.name}
              className="size-10"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{profile?.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {profile?.email}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={signOut}
          >
            <LogOut />
            Sair
          </Button>
        </div>
      </aside>
      {open && (
        <button
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Fechar menu"
        />
      )}
      <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:ml-72 lg:pb-0">
        <header
          className={cn(
            "sticky top-0 z-30 h-16 items-center justify-between border-b bg-background/90 px-3 backdrop-blur-xl sm:px-7 lg:flex",
            isCreatePage ? "hidden" : "flex",
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
            <PwaInstallButton compact />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Olá, <b className="text-foreground">{profile?.name?.split(" ")[0]}</b>
            </span>
            <ProfileAvatar
              src={profile?.avatar_url}
              name={profile?.name}
              className="size-9"
            />
          </div>
        </header>
        <div
          key={location.pathname}
          className="animate-in overflow-x-hidden p-3 sm:p-7"
        >
          <Outlet />
        </div>
      </main>
      <nav className="fixed inset-x-2 bottom-[calc(.5rem+env(safe-area-inset-bottom))] z-30 flex min-h-16 items-center justify-around rounded-2xl border bg-background/95 px-1 shadow-xl backdrop-blur lg:hidden">
        {visibleItems.slice(0, 5).map(([path, , Icon]) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            className={({ isActive }) =>
              cn(
                "flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold",
                isActive ? "text-primary" : "text-muted-foreground",
              )
            }
          >
            <Icon size={19} />
            <span>{mobileLabels[path]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
