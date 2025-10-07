
export const runtime='nodejs';
import { adminClient } from '../../../lib/supabase'; import { signSession } from '../../../lib/auth'; import { hashPin } from '../../../lib/pin'; import { cookies } from 'next/headers';
export async function POST(req){ try{ const {code,pin}=await req.json(); if(!code||!pin) return Response.json({error:'code und pin erforderlich'},{status:400});
const supa=adminClient(); const {data,error}=await supa.from('employees').select('id,code,display_name,role,disabled,pin_salt,pin_hash').eq('code',String(code)).maybeSingle();
if(error) throw error; if(!data) return Response.json({error:'Mitarbeiter nicht gefunden'},{status:404}); if(data.disabled) return Response.json({error:'Mitarbeiter deaktiviert'},{status:403});
const got=hashPin(pin,data.pin_salt); if(got!==data.pin_hash) return Response.json({error:'PIN falsch'},{status:401});
const token=await signSession({sub:data.id,role:data.role,name:data.display_name,code:data.code}); cookies().set({name:'session',value:token,httpOnly:true,sameSite:'lax',secure:true,path:'/',maxAge:60*60*24*7}); return Response.json({ok:true}); } catch(err){ console.error(err); return Response.json({error:'Serverfehler'},{status:500}); } }
