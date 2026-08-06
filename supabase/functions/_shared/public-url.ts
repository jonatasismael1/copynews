export function externalizeStorageUrl(value: string) {
  const publicBase =
    Deno.env.get("SUPABASE_PUBLIC_URL") || Deno.env.get("API_EXTERNAL_URL");
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
