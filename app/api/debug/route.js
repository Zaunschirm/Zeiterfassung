export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE;
    if (!url || !key) {
      return new Response(JSON.stringify({ ok:false, reason:'Missing env', url:!!url, key:!!key }), { status:500 });
    }
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey:key, Authorization:`Bearer ${key}` }
    });
    return new Response(JSON.stringify({ ok:true, status:res.status, url }), { status:200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500 });
  }
}
