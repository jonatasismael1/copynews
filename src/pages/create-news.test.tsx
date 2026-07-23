import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateNewsPage } from "./create-news";

const mutateAsync = vi.fn();
const clipboardRead = vi.fn();

vi.mock("@/hooks/use-data", () => ({
  useCreateNews: () => ({
    isPending: false,
    mutateAsync,
  }),
}));

describe("criação automática de notícia", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ news_item_id: "news-1" });
    clipboardRead.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: clipboardRead },
    });
  });

  afterEach(cleanup);

  function renderPage() {
    render(
      <MemoryRouter>
        <CreateNewsPage />
      </MemoryRouter>,
    );
  }

  it("mantém a transcrição desligada e bloqueia o processamento sem URL válida", () => {
    renderPage();

    expect(
      screen.getByRole("switch", { name: /Transcrever áudio/i }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Processar notícia" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Colar link da área de transferência",
      }),
    ).toHaveClass("size-11");
    expect(
      screen.queryByLabelText("Observações"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Categoria, destino e tom serão definidos automaticamente.",
      ),
    ).toBeInTheDocument();
  });

  it("cola no próprio campo e preserva o payload enviado ao processamento", async () => {
    clipboardRead.mockResolvedValue("https://instagram.com/reel/exemplo");
    renderPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Colar link da área de transferência",
      }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("URL da publicação")).toHaveValue(
        "https://instagram.com/reel/exemplo",
      ),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: /Transcrever áudio/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Adicionar observações" }),
    );
    fireEvent.change(screen.getByLabelText("Observações"), {
      target: { value: "Preservar os créditos." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Processar notícia" }),
    );

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        source_url: "https://instagram.com/reel/exemplo",
        transcribe_audio: true,
        notes: "Preservar os créditos.",
      }),
    );
  });

  it("explica a transcrição e permite adicionar e remover observações", () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Saiba mais sobre transcrição de áudio",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Quando transcrever o áudio?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Adicionar observações" }),
    );
    fireEvent.change(screen.getByLabelText("Observações"), {
      target: { value: "Contexto adicional" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(
      screen.getByRole("button", { name: "Editar observação adicionada" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Editar observação adicionada" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remover observações" }),
    );

    expect(screen.queryByLabelText("Observações")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar observações" }),
    ).toBeInTheDocument();
  });
});
