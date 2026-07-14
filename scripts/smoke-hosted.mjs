import { createClient } from "@supabase/supabase-js";
const {
  SUPABASE_URL: url,
  SUPABASE_SECRET_KEY: secret,
  SUPABASE_PUBLISHABLE_KEY: publishable,
  INITIAL_ADMIN_PASSWORD: password,
  INITIAL_ADMIN_EMAIL: initialEmail = "admin@copynews.local",
} = process.env;
const admin = createClient(url, secret, { auth: { persistSession: false } }),
  client = createClient(url, publishable, { auth: { persistSession: false } });
const login = await client.auth.signInWithPassword({
  email: initialEmail,
  password,
});
if (login.error) throw login.error;
const created = [];
let originalAdminGoal;
try {
  const tempEmail = `edge-${Date.now()}@copynews.local`;
  const userResult = await client.functions.invoke("admin-users", {
    body: {
      action: "create",
      name: "Teste Edge Function",
      email: tempEmail,
      password: "Temp#Copy2026!Aa",
      role: "viewer",
      daily_goal: 0,
    },
  });
  if (userResult.error) throw userResult.error;
  created.push(["user", userResult.data.id]);
  const profiles = await admin
    .from("profiles")
    .select("id,daily_goal")
    .in("id", [login.data.user.id, userResult.data.id]);
  if (profiles.error) throw profiles.error;
  originalAdminGoal = profiles.data.find(
    (item) => item.id === login.data.user.id,
  )?.daily_goal;
  const ownGoal = await client.functions.invoke("admin-users", {
    body: { action: "update", id: login.data.user.id, daily_goal: 17 },
  });
  const otherGoal = await client.functions.invoke("admin-users", {
    body: { action: "update", id: userResult.data.id, daily_goal: 9 },
  });
  if (ownGoal.error || otherGoal.error)
    throw ownGoal.error || otherGoal.error;
  const goalCheck = await admin
    .from("profiles")
    .select("id,daily_goal")
    .in("id", [login.data.user.id, userResult.data.id]);
  if (
    goalCheck.error ||
    goalCheck.data.find((item) => item.id === login.data.user.id)?.daily_goal !==
      17 ||
    goalCheck.data.find((item) => item.id === userResult.data.id)?.daily_goal !== 9
  )
    throw goalCheck.error || new Error("Admin goal management failed");
  const queued = await client.functions.invoke("process-source-url", {
    body: {
      source_url: "https://www.instagram.com/reel/DYvbjoLAeBx/",
      editorial_tone: "Jornalístico",
    },
  });
  if (queued.error) throw queued.error;
  created.push(["news", queued.data.news_item_id]);
  const revisionNews = await admin
    .from("news_items")
    .insert({
      source_url: "https://example.com/source",
      source_platform: "web",
      source_caption:
        "A prefeitura inaugurou uma escola municipal nesta segunda-feira.",
      generated_title: "Prefeitura inaugura escola",
      generated_caption: "Uma nova escola foi inaugurada.",
      status: "draft",
      created_by: login.data.user.id,
    })
    .select()
    .single();
  if (revisionNews.error) throw revisionNews.error;
  created.push(["news", revisionNews.data.id]);
  const revised = await client.functions.invoke("revise-news-field", {
    body: {
      news_item_id: revisionNews.data.id,
      field: "title",
      instruction: "Deixe mais direto",
    },
  });
  if (revised.error || !revised.data.preview)
    throw revised.error || new Error("AI revision missing");
  const appliedRevision = await client.rpc("apply_news_revision", {
    p_news_id: revisionNews.data.id,
    p_field: "title",
    p_value: revised.data.preview,
    p_instruction: "Deixe mais direto",
  });
  if (appliedRevision.error) throw appliedRevision.error;
  const version = await client
    .from("news_versions")
    .select("change_type,instruction,new_value")
    .eq("news_item_id", revisionNews.data.id)
    .eq("field", "title")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (
    version.error ||
    version.data.change_type !== "ai" ||
    version.data.new_value !== revised.data.preview
  )
    throw version.error || new Error("AI revision was not versioned");
  const linkedPublication = await client.functions.invoke(
    "create-publication",
    {
      body: {
        news_item_id: revisionNews.data.id,
        title: revisionNews.data.generated_title,
        caption: revisionNews.data.generated_caption,
        platform: "Instagram",
        published_url: `https://instagram.com/p/linked-${Date.now()}`,
        published_at: new Date().toISOString(),
      },
    },
  );
  if (
    linkedPublication.error ||
    linkedPublication.data.news_item_id !== revisionNews.data.id ||
    linkedPublication.data.source_type !== "copy_news"
  )
    throw linkedPublication.error || new Error("Linked publication missing");
  created.push(["publication", linkedPublication.data.id]);
  const publication = await client.functions.invoke("create-publication", {
    body: {
      title: "Teste de publicação externa",
      platform: "Instagram",
      published_url: `https://instagram.com/p/test-${Date.now()}`,
      published_at: new Date().toISOString(),
    },
  });
  if (publication.error) throw publication.error;
  created.push(["publication", publication.data.id]);
  const metrics = await client.functions.invoke("record-metrics", {
    body: {
      publication_id: publication.data.id,
      captured_at: new Date().toISOString(),
      views: 100,
      reach: 80,
      impressions: 120,
      likes: 10,
      comments: 2,
      shares: 3,
      saves: 4,
      clicks: 1,
      followers_gained: 0,
    },
  });
  if (metrics.error) throw metrics.error;
  const nextMetrics = await client.functions.invoke("record-metrics", {
    body: {
      publication_id: publication.data.id,
      captured_at: new Date(Date.now() + 1000).toISOString(),
      views: 180,
      reach: 140,
      impressions: 220,
      likes: 18,
      comments: 4,
      shares: 6,
      saves: 7,
      clicks: 3,
      followers_gained: 1,
    },
  });
  if (nextMetrics.error) throw nextMetrics.error;
  const snapshots = await client
    .from("metric_snapshots")
    .select("views,source")
    .eq("publication_id", publication.data.id)
    .order("captured_at");
  if (
    snapshots.error ||
    snapshots.data.length !== 2 ||
    snapshots.data.some((snapshot) => snapshot.source !== "manual")
  )
    throw snapshots.error || new Error("Metric history was not preserved");
  const dashboard = await client.rpc("dashboard_summary", {
    p_from: null,
    p_to: null,
  });
  if (
    dashboard.error ||
    Number(dashboard.data.publications) < 2 ||
    !Array.isArray(dashboard.data.production_by_user) ||
    !Array.isArray(dashboard.data.publications_by_page) ||
    !Array.isArray(dashboard.data.ranking)
  )
    throw dashboard.error || new Error("Dashboard did not count publication");
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "admin Edge Function",
        "admin own and other user goals",
        "authenticated enqueue",
        "OpenRouter preview and confirmed AI version",
        "linked publication",
        "external publication",
        "metric snapshot history and manual source",
        "America/Maceio dashboard breakdowns",
      ],
      job_id: queued.data.job_id,
    }),
  );
} finally {
  if (originalAdminGoal !== undefined)
    await admin
      .from("profiles")
      .update({ daily_goal: originalAdminGoal })
      .eq("id", login.data.user.id);
  for (const [type, id] of created.reverse()) {
    if (type === "user") await admin.auth.admin.deleteUser(id);
    if (type === "news") await admin.from("news_items").delete().eq("id", id);
    if (type === "publication")
      await admin.from("publications").delete().eq("id", id);
  }
}
