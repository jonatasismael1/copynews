export function externalizeStorageUrl(value: string, requestOrigin?: string) {
  const publicBase = (
    Deno.env.get("SUPABASE_PUBLIC_URL") ||
    Deno.env.get("API_EXTERNAL_URL") ||
    requestOrigin ||
    ""
  ).replace(/["']/g, "").trim();
  if (!publicBase || !value) return value;

  try {
    const source = new URL(value, publicBase);
    return new URL(
      `${source.pathname}${source.search}${source.hash}`,
      publicBase,
    ).toString();
  } catch {
    return value;
  }
}
