import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { uploadStorageFile } from "@/lib/storage-upload";
import type {
  NewsItem,
  NewsDesign,
  ProcessingJob,
  Profile,
  Publication,
  DesignTemplate,
  DistributionRecipient,
  NewsSendHistory,
  DistributionDirectPreview,
  DistributionOperationalAlert,
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

export function useDistribution() {
  return useQuery({
    queryKey: ["distribution"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("news-distribution", { body: { action: "list" } });
      if (error) throw error;
      return data as { recipients: DistributionRecipient[]; history: NewsSendHistory[] };
    },
    refetchInterval: (query) => query.state.data?.history.some((item) => item.status === "queued" || item.status === "processing") ? 2000 : 15000,
  });
}

async function distributionAction(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("news-distribution", { body });
  if (error) {
    let detail = error.message;
    try {
      const payload = await (error as unknown as { context?: Response }).context?.clone().json();
      if (payload?.error) detail = payload.error;
    } catch { /* response body unavailable */ }
    throw new Error(detail);
  }
  return data;
}

export function useManageDistributionRecipient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: distributionAction,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["distribution"] }),
    onError: (error) => toast.error(message(error)),
  });
}

export function useSendNews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ newsId, recipientId, forceResend = false }: { newsId: string; recipientId: string; forceResend?: boolean }) =>
      distributionAction({ action: "send", news_id: newsId, recipient_id: recipientId, force_resend: forceResend }),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["distribution"] });
      queryClient.invalidateQueries({ queryKey: ["news", input.newsId] });
    },
  });
}

export function useResolveDistributionUrl() {
  return useMutation({ mutationFn: (sourceUrl: string) => distributionAction({ action: "resolve_url", source_url: sourceUrl }) as Promise<{type:"existing_news";news:{id:string}}|{type:"not_found";normalized_url:string}> });
}
export function useCreateDistributionPreview() { return useMutation({ mutationFn: (sourceUrl:string) => distributionAction({action:"create_preview",source_url:sourceUrl}) as Promise<DistributionDirectPreview> }); }

export function useDistributionPreview(previewId?: string | null) {
  return useQuery({ queryKey: ["distribution-preview", previewId], enabled: Boolean(previewId), queryFn: () => distributionAction({ action: "preview", preview_id: previewId }) as Promise<DistributionDirectPreview>, refetchInterval: (query) => ["queued", "processing"].includes(query.state.data?.status || "") ? 1500 : false });
}

export function useDistributionOperations() {
  return useQuery({ queryKey: ["distribution-operations"], queryFn: () => distributionAction({ action: "recent_previews" }) as Promise<{previews:DistributionDirectPreview[];alerts:DistributionOperationalAlert[]}>, refetchInterval: (query) => query.state.data?.previews.some((item)=>["queued","processing"].includes(item.status)) ? 3000 : 30000 });
}

export function useResolveDistributionAlert() {
  const queryClient=useQueryClient();
  return useMutation({mutationFn:(id:string)=>distributionAction({action:"resolve_alert",id}),onSuccess:()=>queryClient.invalidateQueries({queryKey:["distribution-operations"]})});
}
export function useManageDistributionPreview(){const queryClient=useQueryClient();return useMutation({mutationFn:({id,action}:{id:string;action:"retry_preview"|"cancel_preview"})=>distributionAction({action,preview_id:id}),onSuccess:()=>queryClient.invalidateQueries({queryKey:["distribution-operations"]})});}

export function useSendDirectUrl() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({previewId,recipientId}:{previewId:string;recipientId:string}) => distributionAction({ action: "send_direct", preview_id: previewId, recipient_id: recipientId }), onSuccess: () => queryClient.invalidateQueries({queryKey:["distribution"]}) });
}
export function useUpdateDistributionPreview(){const queryClient=useQueryClient();return useMutation({mutationFn:({previewId,title}:{previewId:string;title:string})=>distributionAction({action:"update_preview",preview_id:previewId,original_title:title}) as Promise<DistributionDirectPreview>,onSuccess:(data)=>queryClient.setQueryData(["distribution-preview",data.id],data)});}

export function usePrepareDistributionBatch() {
  return useMutation({ mutationFn: async (sourceUrls:string[]) => {
    const created=await distributionAction({action:"create_previews",source_urls:sourceUrls}) as DistributionDirectPreview[];
    const order=new Map(created.map((item,index)=>[item.id,index]));
    let previews=created;
    for(let attempt=0;attempt<180&&previews.some((item)=>["queued","processing"].includes(item.status));attempt+=1){
      await new Promise(resolve=>setTimeout(resolve,1500));
      previews=await distributionAction({action:"previews",preview_ids:created.map((item)=>item.id)}) as DistributionDirectPreview[];
    }
    previews.sort((a,b)=>(order.get(a.id)??0)-(order.get(b.id)??0));
    const incomplete=previews.findIndex((item)=>item.status!=="ready");
    if(incomplete>=0)throw new Error(`Não foi possível preparar o link ${incomplete+1}`);
    return previews;
  }});
}

export function useSendDistributionBatch(){
  const queryClient=useQueryClient();
  return useMutation({mutationFn:({previewIds,recipientId}:{previewIds:string[];recipientId:string})=>distributionAction({action:"send_batch",preview_ids:previewIds,recipient_id:recipientId}),onSuccess:()=>queryClient.invalidateQueries({queryKey:["distribution"]})});
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

export type NewsDesignWithTemplate = NewsDesign & {
  design_templates: DesignTemplate | null;
  generated_media: {
    id: string;
    storage_path: string;
    mime_type: "image/png" | "image/jpeg" | "video/mp4";
    created_at: string;
  }[];
};

export function useNewsDesign(newsId?: string) {
  return useQuery({
    queryKey: ["news-design", newsId],
    enabled: Boolean(newsId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_designs")
        .select("*,design_templates(*),generated_media(*)")
        .eq("news_id", newsId!)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as NewsDesignWithTemplate | null;
    },
    refetchInterval: (query) =>
      query.state.data?.status === "rendering" ? 2000 : false,
  });
}

export function useDefaultDesignTemplate() {
  return useQuery({
    queryKey: ["design-template", "default"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("design_templates")
        .select("*,design_template_layers(*)")
        .eq("is_active", true)
        .eq("is_default", true)
        .single();
      if (error) throw error;
      return data as DesignTemplate & {
        design_template_layers: {
          id: string;
          layer_key: string;
          layer_type: string;
          z_index: number;
          config_json: Record<string, unknown>;
          is_visible: boolean;
          is_locked: boolean;
        }[];
      };
    },
  });
}

export function useDesignTemplates() {
  return useQuery({
    queryKey: ["design-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("design_templates")
        .select("*,design_template_layers(*)")
        .eq("is_active", true)
        .order("height", { ascending: false });
      if (error) throw error;
      return data as (DesignTemplate & {
        design_template_layers: {
          id: string;
          layer_key: string;
          layer_type: string;
          z_index: number;
          config_json: Record<string, unknown>;
          is_visible: boolean;
          is_locked: boolean;
        }[];
      })[];
    },
  });
}

export function useCreateNews() {
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const mutation = useMutation({
    mutationFn: async (input: CreateNewsInput & { media_file?: File }) => {
      let uploadedPath: string | null = null;
      let body: Record<string, unknown> = input;
      if (input.media_file) {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw userError || new Error("Sessão inválida");
        const file = input.media_file;
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        uploadedPath = `${userData.user.id}/sources/${crypto.randomUUID()}-${safeName}`;
        await uploadStorageFile("temporary-media", uploadedPath, file, {
          contentType: file.type,
          upsert: false,
          onProgress: file.size > 6 * 1024 * 1024 ? setUploadProgress : undefined,
        });
        const values: Record<string, unknown> = { ...input };
        delete values.media_file;
        body = { ...values, source_media: { path: uploadedPath, name: file.name, mime_type: file.type, size: file.size } };
      }
      const { data, error } = await supabase.functions.invoke(
        "process-source-url",
        { body },
      );
      if (error) {
        if (uploadedPath)
          await supabase.storage.from("temporary-media").remove([uploadedPath]);
        let detail = error.message;
        try {
          const payload = await (error as unknown as { context?: Response })
            .context?.clone().json();
          if (payload?.error) detail = payload.error;
        } catch {
          // Preserve the SDK error when the response body is unavailable.
        }
        throw new Error(detail);
      }
      return data as { news_item_id: string; job_id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news"] });
      toast.success("Notícia enviada para processamento");
    },
    onError: (error) => toast.error(message(error)),
    onSettled: () => setUploadProgress(null),
  });
  return { ...mutation, uploadProgress };
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

export function useRefreshPublicationMetrics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (publicationId: string) => {
      const { data, error } = await supabase.functions.invoke(
        "refresh-publication-metrics",
        { body: { publication_id: publicationId } },
      );
      if (error) {
        let detail = error.message;
        try {
          const payload = await (error as unknown as { context?: Response })
            .context?.clone().json();
          if (payload?.error) detail = payload.error;
        } catch {
          // Preserve the SDK error when the response body is unavailable.
        }
        throw new Error(detail);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publications"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Métricas atualizadas pelo Instagram");
    },
    onError: (error) => toast.error(message(error)),
  });
}

export function useConnectedAccounts(enabled = true) {
  return useQuery({
    queryKey: ["connected-accounts"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connected_accounts")
        .select("id,user_id,page_id,provider,provider_account_id,username,account_name,profile_picture_url,status,last_sync_at,token_expires_at,last_refresh_at,needs_attention,refresh_error,data_source,profiles!connected_accounts_user_id_fkey(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
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

export type AdminDailyResult = {
  day: string;
  user_id: string;
  user_name: string;
  daily_goal: number;
  news_created: number;
  news_completed: number;
  publications: number;
  interactions: number;
};

export function useAdminDailyResults(days = 1, enabled = true) {
  const bounds = dashboardBounds(days);
  return useQuery({
    queryKey: ["admin-daily-results", days],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_daily_results", {
        p_from: bounds.from,
        p_to: bounds.to,
      });
      if (error) throw error;
      return data as AdminDailyResult[];
    },
  });
}
