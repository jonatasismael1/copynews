import { createClient } from "@supabase/supabase-js";
const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key)
  throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const admin = createClient(url, key, { auth: { persistSession: false } });
const initialEmail = process.env.INITIAL_ADMIN_EMAIL || "admin@copynews.local";
const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
if (!initialPassword) throw new Error("INITIAL_ADMIN_PASSWORD is required");
async function ensureUser(email, password, role, name) {
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list.data.users.find((x) => x.email === email);
  if (!user) {
    const result = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
      app_metadata: { role },
    });
    if (result.error) throw result.error;
    user = result.data.user;
  }
  await admin
    .from("profiles")
    .update({ name, role, is_active: true })
    .eq("id", user.id);
  return user;
}
const initial = await ensureUser(
  initialEmail,
  initialPassword,
  "admin",
  "Administrador Geral",
);
const suffix = Date.now(),
  password = `Test#${crypto.randomUUID()}Aa1!`;
const testUsers = [];
try {
  for (const role of ["admin", "editor", "writer", "viewer"])
    testUsers.push(
      await ensureUser(
        `rls-${role}-${suffix}@copynews.local`,
        password,
        role,
        `Teste ${role}`,
      ),
    );
  const clients = {};
  for (const user of testUsers) {
    const role = user.app_metadata.role;
    const client = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const login = await client.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (login.error) throw login.error;
    clients[role] = client;
  }
  const adminAudit = await clients.admin
    .from("audit_logs")
    .select("id")
    .limit(1);
  if (adminAudit.error)
    throw new Error(
      `RLS failed: admin cannot read audit logs: ${adminAudit.error.message}`,
    );
  const writer = testUsers.find((x) => x.app_metadata.role === "writer");
  const inserted = await clients.writer
    .from("news_items")
    .insert({
      source_url: "https://example.com/test-rls",
      source_platform: "web",
      status: "draft",
      created_by: writer.id,
      assigned_to: writer.id,
    })
    .select()
    .single();
  if (inserted.error) throw inserted.error;
  const approve = await clients.writer
    .from("news_items")
    .update({ status: "approved" })
    .eq("id", inserted.data.id);
  if (!approve.error)
    throw new Error("RLS/guard failed: writer approved content");
  const viewerInsert = await clients.viewer.from("news_items").insert({
    source_url: "https://example.com/viewer",
    status: "draft",
    created_by: testUsers.find((x) => x.app_metadata.role === "viewer").id,
  });
  if (!viewerInsert.error)
    throw new Error("RLS failed: viewer inserted content");
  const writerReassign = await clients.writer
    .from("news_items")
    .update({
      assigned_to: testUsers.find(
        (user) => user.app_metadata.role === "viewer",
      ).id,
    })
    .eq("id", inserted.data.id);
  if (!writerReassign.error)
    throw new Error("Assignment guard failed: writer reassigned content");
  const editorReassign = await clients.editor
    .from("news_items")
    .update({
      assigned_to: testUsers.find(
        (user) => user.app_metadata.role === "editor",
      ).id,
    })
    .eq("id", inserted.data.id);
  if (!editorReassign.error)
    throw new Error("Assignment guard failed: editor reassigned content");
  const adminReassign = await clients.admin
    .from("news_items")
    .update({
      assigned_to: testUsers.find(
        (user) => user.app_metadata.role === "admin",
      ).id,
    })
    .eq("id", inserted.data.id);
  if (adminReassign.error) throw adminReassign.error;
  const editorApprove = await clients.editor
    .from("news_items")
    .update({ status: "approved" })
    .eq("id", inserted.data.id);
  if (editorApprove.error) throw editorApprove.error;
  const viewerRead = await clients.viewer
    .from("news_items")
    .select("id")
    .eq("id", inserted.data.id);
  if (viewerRead.error || viewerRead.data.length !== 1)
    throw new Error("RLS failed: viewer cannot read");
  const writerArchive = await clients.writer.functions.invoke("manage-news", {
    body: { action: "archive", news_id: inserted.data.id },
  });
  if (writerArchive.error) throw writerArchive.error;
  const archivedNews = await admin
    .from("news_items")
    .select("archived_at,status")
    .eq("id", inserted.data.id)
    .single();
  if (
    archivedNews.error ||
    !archivedNews.data.archived_at ||
    archivedNews.data.status !== "archived"
  )
    throw archivedNews.error || new Error("Writer archive failed");
  const writerDelete = await clients.writer.functions.invoke("manage-news", {
    body: { action: "delete", news_id: inserted.data.id },
  });
  if (writerDelete.error) throw writerDelete.error;

  const writerPublication = await clients.writer
    .from("publications")
    .insert({
      title: "Publicação do redator",
      platform: "Instagram",
      published_url: `https://instagram.com/p/writer-${suffix}`,
      published_at: new Date().toISOString(),
      created_by: writer.id,
      posted_by: writer.id,
      source_type: "external",
    })
    .select("id")
    .single();
  if (writerPublication.error) throw writerPublication.error;
  const publicationArchive = await clients.writer.functions.invoke(
    "manage-publications",
    {
      body: {
        action: "archive",
        publication_id: writerPublication.data.id,
      },
    },
  );
  if (publicationArchive.error) throw publicationArchive.error;
  const publicationDelete = await clients.writer.functions.invoke(
    "manage-publications",
    {
      body: {
        action: "delete",
        publication_id: writerPublication.data.id,
      },
    },
  );
  if (publicationDelete.error) throw publicationDelete.error;
  await admin.from("news_items").delete().eq("id", inserted.data.id);
  console.log(
    JSON.stringify({
      ok: true,
      initial_admin_id: initial.id,
      checks: [
        "admin user creation",
        "admin audit read",
        "writer create",
        "writer approval denied",
        "writer and editor reassignment denied",
        "admin reassignment allowed",
        "editor approval",
        "viewer read",
        "viewer write denied",
        "writer news archive and delete",
        "writer publication archive and delete",
      ],
    }),
  );
} finally {
  for (const user of testUsers) await admin.auth.admin.deleteUser(user.id);
}
