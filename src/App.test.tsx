import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    session: { user: { id: "user-1" } },
    profile: { id: "user-1", name: "Usuário", is_active: true },
    loading: false,
  }),
}));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true }));
vi.mock("@/components/app-shell", () => ({ AppShell: () => <Outlet /> }));
vi.mock("@/pages/create-news", () => ({
  CreateNewsPage: () => <h1>Criar conteúdo</h1>,
}));
vi.mock("@/pages/dashboard", () => ({
  DashboardPage: () => <h1>Visão geral</h1>,
}));

describe("rota inicial", () => {
  it("abre Criar ao entrar no aplicativo", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Criar conteúdo" }),
    ).toBeInTheDocument();
  });

  it("mantém a Visão geral disponível em sua própria rota", async () => {
    render(
      <MemoryRouter initialEntries={["/visao-geral"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Visão geral" }),
    ).toBeInTheDocument();
  });
});
