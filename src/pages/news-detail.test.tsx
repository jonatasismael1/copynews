import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewsDetailPage } from "./news-detail";

const clipboardWrite = vi.fn();
const refetch = vi.fn();
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  prepareMediaFiles: vi.fn(),
  savePreparedMediaFiles: vi.fn(),
}));

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
let currentNews: Omit<typeof news, "temporary_media_path"> & {
  temporary_media_path: string | null;
} = news;

vi.mock("@/hooks/use-data", () => ({
  useLookups: () => ({
    data: { profiles: [], categories: [], pages: [] },
  }),
  useNewsItem: () => ({ data: currentNews, isLoading: false, refetch }),
  useNewsDesign: () => ({ data: null, isLoading: false }),
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
    functions: { invoke: mocks.invoke },
    storage: {
      from: () => ({
        createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    },
    rpc: vi.fn(),
  },
}));

vi.mock("@/lib/media-download", () => ({
  isAppleMobile: () => false,
  prepareMediaFiles: mocks.prepareMediaFiles,
  savePreparedMediaFiles: mocks.savePreparedMediaFiles,
}));

describe("detalhes da notícia no mobile", () => {
  afterEach(cleanup);

  beforeEach(() => {
    currentNews = {
      ...news,
      temporary_media_paths: [...news.temporary_media_paths],
    };
    clipboardWrite.mockReset();
    mocks.invoke.mockReset();
    mocks.prepareMediaFiles.mockReset();
    mocks.savePreparedMediaFiles.mockReset();
    mocks.invoke.mockResolvedValue({
      data: { urls: [{ url: "https://media.local/1.mp4" }] },
      error: null,
    });
    mocks.prepareMediaFiles.mockImplementation(async (urls: string[]) =>
      urls.map(
        (_, index) =>
          new File([`media-${index + 1}`], `arquivo-${index + 1}.mp4`, {
            type: "video/mp4",
          }),
      ),
    );
    mocks.savePreparedMediaFiles.mockResolvedValue("downloaded");
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

    const mobileSummary = screen.getByTestId("mobile-news-summary");
    expect(within(mobileSummary).getByRole("button", { name: "Voltar" })).toBeInTheDocument();
    expect(within(mobileSummary).getByTestId("mobile-news-title")).toHaveTextContent(
      news.generated_title,
    );
    expect(within(mobileSummary).getByText("23/07/2026")).toBeInTheDocument();
    expect(within(mobileSummary).getAllByText(news.generated_title)).toHaveLength(1);

    expect(screen.getByRole("button", { name: "Reescrever" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Abrir fonte" }),
    ).toHaveAttribute("href", news.source_url);
    expect(screen.getByRole("button", { name: "Baixar" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mais" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mais ações" }),
    ).toBeInTheDocument();

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
    const scrollableTexts = screen.getAllByTestId("scrollable-text");
    expect(scrollableTexts.length).toBeGreaterThan(0);
    scrollableTexts.forEach((text) => {
      expect(text).toHaveClass("overflow-y-auto");
      expect(text).not.toHaveClass("line-clamp-4", "line-clamp-6");
    });
    fireEvent.click(screen.getByRole("button", { name: "Editar legenda" }));

    expect(
      screen.getByRole("dialog", { name: "Editar legenda" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar legenda" })).toBeInTheDocument();
  });

  it("baixa uma mídia diretamente sem abrir seleção", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Baixar" }));

    expect(
      screen.queryByRole("dialog", { name: "Baixar mídia" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.savePreparedMediaFiles).toHaveBeenCalledTimes(1),
    );
    expect(mocks.prepareMediaFiles).toHaveBeenCalledWith(
      ["https://media.local/1.mp4"],
      "copy-news-news-1",
    );
  });

  it("permite baixar tudo ou um item específico de um carrossel", async () => {
    currentNews = {
      ...news,
      temporary_media_paths: [
        "media/01.jpg",
        "media/02.jpg",
        "media/03.jpg",
      ],
    };
    mocks.invoke.mockResolvedValue({
      data: {
        urls: [
          { url: "https://media.local/1.jpg" },
          { url: "https://media.local/2.jpg" },
          { url: "https://media.local/3.jpg" },
        ],
      },
      error: null,
    });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Baixar" }));
    expect(
      screen.getByRole("dialog", { name: "Baixar mídia" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Baixar tudo (3)" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Baixar arquivo 2" }),
    );

    await waitFor(() =>
      expect(mocks.savePreparedMediaFiles).toHaveBeenCalledTimes(1),
    );
    const selectedFiles = mocks.savePreparedMediaFiles.mock.calls[0][0] as File[];
    expect(selectedFiles).toHaveLength(1);
    expect(selectedFiles[0].name).toBe("arquivo-2.mp4");
  });

  it("desativa abrir fonte e baixar quando os dados não estão disponíveis", () => {
    currentNews = {
      ...news,
      source_url: "",
      temporary_media_path: null,
      temporary_media_paths: [],
    };
    renderPage();

    expect(
      screen.getByRole("button", { name: "Abrir fonte" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Baixar" })).toBeDisabled();
  });
});
