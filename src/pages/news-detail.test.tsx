import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewsDetailPage } from "./news-detail";

const clipboardWrite = vi.fn();
const refetch = vi.fn();

const longCaption =
  "Crédito do vídeo: @copynews. " +
  "Esta é uma legenda jornalística extensa, com todos os fatos, nomes, datas, locais e contexto necessários para testar a visualização resumida. ".repeat(
    5,
  );

const news = {
  id: "news-1",
  source_url: "https://example.com/noticia",
  source_platform: "Instagram",
  source_author: "@copynews",
  source_caption: "Legenda original completa",
  original_title: "Título original completo",
  original_caption: "Legenda original completa",
  clean_original_caption: "Legenda original completa",
  raw_ocr_text: "OCR completo",
  temporary_media_path: "media/video.mp4",
  temporary_media_paths: ["media/video.mp4"],
  transcript: "Transcrição completa",
  generated_title: "Título reescrito de impacto para a notícia",
  generated_caption: longCaption,
  highlight: "Investigação",
  highlight_options: ["Investigação", "Polícia", "Arapiraca"],
  editorial_tone: "Jornalístico",
  ai_warnings: ["Revisar data"],
  status: "draft",
  assigned_to: "profile-1",
  created_by: "profile-1",
  created_at: "2026-07-23T12:00:00.000Z",
  scheduled_at: null,
  categories: { name: "Polícia" },
  profiles: { name: "Repórter" },
  processing_jobs: [
    { id: "job-1", status: "completed", progress: 100, step_results: {} },
  ],
  news_versions: [],
  status_history: [],
  publications: [],
};

vi.mock("@/hooks/use-data", () => ({
  useLookups: () => ({
    data: { profiles: [], categories: [], pages: [] },
  }),
  useNewsItem: () => ({ data: news, isLoading: false, refetch }),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    profile: {
      id: "profile-1",
      role: "admin",
      canva_video_url: null,
      canva_image_url: null,
    },
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
    functions: { invoke: vi.fn() },
    rpc: vi.fn(),
  },
}));

describe("detalhes da notícia no mobile", () => {
  afterEach(cleanup);

  beforeEach(() => {
    clipboardWrite.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWrite.mockResolvedValue(undefined) },
    });
  });

  function renderPage() {
    render(
      <MemoryRouter initialEntries={["/noticias/news-1"]}>
        <Routes>
          <Route path="/noticias/:id" element={<NewsDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("mantém as ações principais compactas e os controles de cópia acessíveis", () => {
    renderPage();

    expect(screen.getByRole("button", { name: "Reescrever" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Mais" }).length).toBeGreaterThan(0);

    const copyTitle = screen.getByRole("button", { name: "Copiar título" });
    const copyCaption = screen.getByRole("button", { name: "Copiar legenda" });
    expect(copyTitle).toHaveClass("size-11");
    expect(copyCaption).toHaveClass("size-11");
  });

  it("copia o texto completo mesmo depois de recolher a seção", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Legenda.*caracteres/i }));
    fireEvent.click(screen.getByRole("button", { name: "Copiar legenda" }));

    expect(clipboardWrite).toHaveBeenCalledWith(longCaption);
    expect(screen.getByRole("button", { name: "Copiar legenda" })).toBeInTheDocument();
  });

  it("abre edição em tela cheia sem remover o conteúdo direto da página", () => {
    renderPage();

    expect(screen.getByText("Ver mais")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar legenda" }));

    expect(
      screen.getByRole("dialog", { name: "Editar legenda" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar legenda" })).toBeInTheDocument();
  });
});
