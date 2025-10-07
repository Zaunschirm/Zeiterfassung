export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('employees')
      .select('id, code, display_name, role, disabled, created_at')
      .order('display_name', { ascending: true });

    if (error) {
      return NextResponse.json({ ok:false, error:'DB_ERROR', details:error.message }, { status:500 });
    }
    return NextResponse.json({ ok:true, employees: data ?? [] });
  } catch (e) {
    return NextResponse.json({ ok:false, error:'SERVER_ERROR', details:String(e) }, { status:500 });
  }
}
