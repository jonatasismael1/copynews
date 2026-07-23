import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CreateNewsPage } from "./create-news";

vi.mock("@/hooks/use-data", () => ({
  useCreateNews: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

describe("criação automática de notícia", () => {
  it("deixa a transcrição desativada, move o processamento e não pede classificações manuais", () => {
    render(
      <MemoryRouter>
        <CreateNewsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("checkbox", { name: /Transcrever o áudio/i }))
      .not.toBeChecked();
    const pasteButton = screen.getByRole("button", {
      name: /Colar texto copiado/i,
    });
    const processButton = screen.getByRole("button", {
      name: /Processar notícia/i,
    });
    expect(
      pasteButton.compareDocumentPosition(processButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText("Categoria", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("Página de destino", { exact: true }))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Tom editorial", { exact: true }))
      .not.toBeInTheDocument();
    expect(
      screen.getByText(/serão definidos automaticamente/i),
    ).toBeInTheDocument();
  });
});
