import { getSupabase } from "@/lib/supabase";

// Serves a note image from the private bucket. The middleware has already
// required a valid session, so this only hands out a short-lived signed URL.
// The browser caches the redirect a little less than the URL lives.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  const { data, error } = await getSupabase()
    .storage.from("note-images")
    .createSignedUrl(id, 3600);
  if (error || !data) return new Response("Not found", { status: 404 });

  return new Response(null, {
    status: 302,
    headers: { Location: data.signedUrl, "Cache-Control": "private, max-age=3000" },
  });
}
