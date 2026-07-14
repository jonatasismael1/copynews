import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type {
  NewsItem,
  ProcessingJob,
  Profile,
  Publication,
} from "@/lib/database.types";
import type {
  CreateNewsInput,
  MetricInput,
  PublicationInput,
} from "@/lib/schemas";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Ocorreu um erro inesperado";
}

export function useNews() {
  return useQuery({
    queryKey: ["news"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_items")
        .select(
          "*,profiles!news_items_assigned_to_fkey(name),categories(name),processing_jobs(*)",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as (NewsItem & {
        profiles: { name: string } | null;
        categories: { name: string } | null;
        processing_jobs: ProcessingJob[];
      })[];
    },
  });
}

export function useNewsItem(id?: string) {
  return useQuery({
    queryKey: ["news", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_items")
        .select(
          "*,profiles!news_items_assigned_to_fkey(name),categories(name),processing_jobs(*),news_versions(*),status_history(*),publications(*)",
        )
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateNews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateNewsInput) => {
      const { data, error } = await supabase.functions.invoke(
        "process-source-url",
        { body: input },
      );
      if (error) throw error;
      return data as { news_item_id: string; job_id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news"] });
      toast.success("Notícia enviada para processamento");
    },
    onError: (error) => toast.error(message(error)),
  });
}

export function useUpdateNews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: Record<string, unknown>;
    }) => {
      const { error } = await supabase
        .from("news_items")
        .update(values)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news"] });
      toast.success("Alterações salvas");
    },
    onError: (error) => toast.error(message(error)),
  });
}

export type PublicationWithRelations = Publication & {
  pages: { name: string } | null;
  profiles: { name: string } | null;
  metric_snapshots: Record<string, number | string>[];
};

export function usePublications() {
  return useQuery({
    queryKey: ["publications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("publications")
        .select(
          "*,pages(name),profiles!publications_posted_by_fkey(name),metric_snapshots(*)",
        )
        .is("archived_at", null)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data as unknown as PublicationWithRelations[];
    },
  });
}

export function useCreatePublication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PublicationInput) => {
      const { data, error } = await supabase.functions.invoke(
        "create-publication",
        { body: input },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Publicação registrada");
    },
    onError: (error) => toast.error(message(error)),
  });
}

export function useRecordMetrics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MetricInput) => {
      const { data, error } = await supabase.functions.invoke(
        "record-metrics",
        { body: input },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Novo snapshot registrado");
    },
    onError: (error) => toast.error(message(error)),
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Profile[];
    },
  });
}

export function useLookups() {
  return useQuery({
    queryKey: ["lookups"],
    queryFn: async () => {
      const [categories, pages, profiles] = await Promise.all([
        supabase
          .from("categories")
          .select("*")
          .eq("is_active", true)
          .order("name"),
        supabase.from("pages").select("*").eq("is_active", true).order("name"),
        supabase
          .from("profiles")
          .select("id,name,role")
          .eq("is_active", true)
          .order("name"),
      ]);
      if (categories.error) throw categories.error;
      if (pages.error) throw pages.error;
      if (profiles.error) throw profiles.error;
      return {
        categories: categories.data,
        pages: pages.data,
        profiles: profiles.data,
      };
    },
  });
}

export type DashboardSummary = {
  news_created: number;
  awaiting_approval: number;
  approved: number;
  scheduled: number;
  publications: number;
  external_publications: number;
  daily_goal: number;
  period_goal: number;
  period_days: number;
  daily_series: { day: string; total: number }[];
  production_by_user: {
    id: string;
    name: string;
    total: number;
    daily_goal: number | null;
  }[];
  publications_by_page: { name: string; total: number }[];
  ranking: {
    id: string;
    name: string;
    publications: number;
    interactions: number;
  }[];
  top_publications: {
    id: string;
    title: string;
    views: number;
    interactions: number;
  }[];
};

function dashboardBounds(days: number) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const today = new Date(`${date}T00:00:00-03:00`);
  return {
    from: new Date(today.getTime() - (days - 1) * 86_400_000).toISOString(),
    to: new Date(today.getTime() + 86_400_000).toISOString(),
  };
}

export function useDashboard(days = 1) {
  const bounds = dashboardBounds(days);
  return useQuery({
    queryKey: ["dashboard", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_summary", {
        p_from: bounds.from,
        p_to: bounds.to,
      });
      if (error) throw error;
      return data as DashboardSummary;
    },
  });
}
