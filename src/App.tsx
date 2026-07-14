import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { isSupabaseConfigured } from "@/lib/supabase";
import { AppShell } from "@/components/app-shell";
import { LoginPage } from "@/pages/login";

const DashboardPage = lazy(() =>
  import("@/pages/dashboard").then((module) => ({
    default: module.DashboardPage,
  })),
);
const NewsPage = lazy(() =>
  import("@/pages/news").then((module) => ({ default: module.NewsPage })),
);
const CreateNewsPage = lazy(() =>
  import("@/pages/create-news").then((module) => ({
    default: module.CreateNewsPage,
  })),
);
const NewsDetailPage = lazy(() =>
  import("@/pages/news-detail").then((module) => ({
    default: module.NewsDetailPage,
  })),
);
const PublicationsPage = lazy(() =>
  import("@/pages/publications").then((module) => ({
    default: module.PublicationsPage,
  })),
);
const UsersPage = lazy(() =>
  import("@/pages/users").then((module) => ({ default: module.UsersPage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/settings").then((module) => ({
    default: module.SettingsPage,
  })),
);
const SharedNewsPage = lazy(() =>
  import("@/pages/shared-news").then((module) => ({
    default: module.SharedNewsPage,
  })),
);

function Loading() {
  return (
    <div className="grid min-h-72 place-items-center">
      <LoaderCircle className="animate-spin text-primary" />
    </div>
  );
}

function page(content: ReactNode) {
  return <Suspense fallback={<Loading />}>{content}</Suspense>;
}

function Guard() {
  const { session, profile, loading } = useAuth();
  if (loading)
    return (
      <div className="grid min-h-dvh place-items-center">
        <LoaderCircle className="animate-spin text-primary" />
      </div>
    );
  if (!isSupabaseConfigured)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">
            Ambiente não configurado
          </h1>
          <p className="mt-2 text-muted-foreground">
            Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.
          </p>
        </div>
      </div>
    );
  if (!session) return <Navigate to="/login" replace />;
  if (profile && !profile.is_active)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">Acesso desativado</h1>
          <p className="mt-2 text-muted-foreground">
            Fale com um administrador.
          </p>
        </div>
      </div>
    );
  return <AppShell />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/:shareSlug" element={page(<SharedNewsPage />)} />
      <Route element={<Guard />}>
        <Route index element={page(<DashboardPage />)} />
        <Route path="noticias" element={page(<NewsPage />)} />
        <Route path="noticias/:id" element={page(<NewsDetailPage />)} />
        <Route path="criar" element={page(<CreateNewsPage />)} />
        <Route path="publicacoes" element={page(<PublicationsPage />)} />
        <Route path="usuarios" element={page(<UsersPage />)} />
        <Route path="configuracoes" element={page(<SettingsPage />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
