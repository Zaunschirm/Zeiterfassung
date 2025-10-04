import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'PLEASE_SET_JWT_SECRET';
const FORCE_HTTPS = String(process.env.FORCE_HTTPS || 'true') === 'true';
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(cookieParser());
app.set('trust proxy', 1);
if (FORCE_HTTPS) {
  app.use((req,res,next)=>{
    if (req.secure || req.headers['x-forwarded-proto']==='https') return next();
    return res.redirect('https://' + req.headers.host + req.url);
  });
}

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'app.sqlite');
fs.mkdirSync(dataDir, {recursive:true});
const db = new Database(dbPath);

function runSchema(){
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
}
function seed(){
  const now = Date.now();
  const hash = (p)=> bcrypt.hashSync(p, 10);
  const upsert = db.prepare(`INSERT OR IGNORE INTO users (id,name,email,password_hash,role,team_id,force_password_reset,created_at)
                             VALUES (@id,@name,@email,@password_hash,@role,@team_id,@force_password_reset,@created_at)`);
  upsert.run({id:1,name:'Admin',email:'admin@demo.local',password_hash:hash('admin123'),role:'ADMIN',team_id:null,force_password_reset:1,created_at:now});
  upsert.run({id:2,name:'Team Lead',email:'lead@demo.local',password_hash:hash('lead123'),role:'TEAMLEITER',team_id:1,force_password_reset:1,created_at:now});
  upsert.run({id:3,name:'Mitarbeiter',email:'user@demo.local',password_hash:hash('user123'),role:'MITARBEITER',team_id:1,force_password_reset:1,created_at:now});
}
if (process.argv.includes('--init-db')){
  runSchema();
  seed();
  console.log('DB initialisiert.');
  process.exit(0);
}
runSchema();

function sign(payloadObj){
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function verify(token){
  if (!token) return null;
  const [payload, sig] = token.split('.');
  const check = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
  if (check !== sig) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
}
function setAuthCookie(res, session){
  const isProd = NODE_ENV === 'production';
  res.cookie('session', sign(session), {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    domain: COOKIE_DOMAIN || undefined,
    maxAge: 1000*60*60*24*30
  });
}
function clearAuthCookie(res){
  res.clearCookie('session', { path: '/', domain: COOKIE_DOMAIN || undefined });
}
function getUserFromReq(req){
  const token = req.cookies?.session;
  const payload = verify(token);
  if (!payload) return null;
  const user = db.prepare('SELECT id,name,email,role,team_id,force_password_reset FROM users WHERE id=?').get(payload.userId);
  if (!user) return null;
  user.impersonatedUserId = payload.impersonatedUserId || null;
  return user;
}
function requireAuth(req,res,next){
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({error:'unauthenticated'});
  req.user = user;
  next();
}
function requireRole(...roles){
  return (req,res,next)=>{
    if (!req.user) return res.status(401).json({error:'unauthenticated'});
    if (!roles.includes(req.user.role)) return res.status(403).json({error:'forbidden'});
    next();
  }
}
function audit(actorId, action, target, details){
  db.prepare('INSERT INTO audit_log (actor_user_id, action, target, details, created_at) VALUES (?,?,?,?,?)')
    .run(actorId, action, target, JSON.stringify(details||{}), Date.now());
}

// Auth routes
app.post('/api/auth/login', (req,res)=>{
  const {email, password} = req.body||{};
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user) return res.status(400).json({error:'invalid_credentials'});
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(400).json({error:'invalid_credentials'});
  setAuthCookie(res, {userId:user.id});
  audit(user.id, 'login', null, {});
  res.json({ok:true});
});
app.post('/api/auth/logout', (req,res)=>{
  const user = getUserFromReq(req);
  if (user) audit(user.id, 'logout', null, {});
  clearAuthCookie(res);
  res.json({ok:true});
});
app.get('/api/me', requireAuth, (req,res)=> res.json({user:req.user}));
app.post('/api/password-change', requireAuth, (req,res)=>{
  const {oldPassword, newPassword} = req.body||{};
  const fullUser = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(oldPassword, fullUser.password_hash)) return res.status(400).json({error:'wrong_password'});
  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash=?, force_password_reset=0 WHERE id=?').run(newHash, req.user.id);
  audit(req.user.id, 'password_change', null, {});
  res.json({ok:true});
});
app.post('/api/admin/impersonate', requireAuth, requireRole('ADMIN'), (req,res)=>{
  const {userId} = req.body||{};
  const target = db.prepare('SELECT id FROM users WHERE id=?').get(userId);
  if (!target) return res.status(404).json({error:'user_not_found'});
  setAuthCookie(res, {userId: target.id, impersonatedUserId: req.user.id});
  audit(req.user.id, 'impersonate', String(userId), {});
  res.json({ok:true});
});
// Minimal user mgmt
app.post('/api/users', requireAuth, requireRole('ADMIN'), (req,res)=>{
  const {name,email,password,role,team_id} = req.body||{};
  if (!name || !email || !password || !role) return res.status(400).json({error:'missing_fields'});
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db.prepare('INSERT INTO users (name,email,password_hash,role,team_id,force_password_reset,created_at) VALUES (?,?,?,?,?,1,?)')
      .run(name,email,hash,role,team_id||null, Date.now());
    audit(req.user.id, 'user_create', String(info.lastInsertRowid), {email,role});
    res.json({ok:true, id: info.lastInsertRowid});
  } catch(e){ res.status(400).json({error:'email_exists'}); }
});
app.post('/api/users/:id/role', requireAuth, requireRole('ADMIN'), (req,res)=>{
  const id = Number(req.params.id);
  const {role, team_id} = req.body||{};
  if (!['ADMIN','TEAMLEITER','MITARBEITER'].includes(role)) return res.status(400).json({error:'bad_role'});
  db.prepare('UPDATE users SET role=?, team_id=? WHERE id=?').run(role, team_id||null, id);
  audit(req.user.id, 'user_role_change', String(id), {role,team_id});
  res.json({ok:true});
});

// Timesheets
app.get('/api/timesheets', requireAuth, (req,res)=>{
  const { month, userId } = req.query;
  const uid = userId ? Number(userId) : req.user.id;
  if (req.user.role === 'TEAMLEITER'){
    const target = db.prepare('SELECT team_id FROM users WHERE id=?').get(uid);
    if (!target || target.team_id !== req.user.team_id) return res.status(403).json({error:'forbidden'});
  }
  const rows = db.prepare('SELECT * FROM timesheets WHERE user_id=? AND substr(date,1,7)=? ORDER BY date').all(uid, month);
  res.json({items: rows});
});
app.post('/api/timesheets', requireAuth, (req,res)=>{
  const { date, type, hours, note, userId } = req.body||{};
  const uid = userId || req.user.id;
  if (req.user.role === 'MITARBEITER' && uid !== req.user.id) return res.status(403).json({error:'forbidden'});
  if (req.user.role === 'TEAMLEITER'){
    const target = db.prepare('SELECT team_id FROM users WHERE id=?').get(uid);
    if (!target || target.team_id !== req.user.team_id) return res.status(403).json({error:'forbidden'});
  }
  if (!['WORK','URLAUB','KRANK'].includes(type)) return res.status(400).json({error:'bad_type'});
  const now = Date.now();
  const info = db.prepare('INSERT INTO timesheets (user_id,date,type,hours,note,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(uid, date, type, Number(hours||0), note||null, req.user.id, req.user.id, now, now);
  audit(req.user.id, 'timesheet_create', String(info.lastInsertRowid), {uid,date,type,hours});
  res.json({ok:true, id: info.lastInsertRowid});
});
app.put('/api/timesheets/:id', requireAuth, (req,res)=>{
  // Admin-only edit
  if (req.user.role !== 'ADMIN') return res.status(403).json({error:'forbidden'});
  const id = Number(req.params.id);
  const { date, type, hours, note } = req.body||{};
  const row = db.prepare('SELECT * FROM timesheets WHERE id=?').get(id);
  if (!row) return res.status(404).json({error:'not_found'});
  const now = Date.now();
  db.prepare('UPDATE timesheets SET date=?, type=?, hours=?, note=?, updated_by=?, updated_at=? WHERE id=?')
    .run(date||row.date, type||row.type, Number(hours??row.hours), note??row.note, req.user.id, now, id);
  audit(req.user.id, 'timesheet_update', String(id), {date,type,hours});
  res.json({ok:true});
});

// API: guard
app.get('/api/guard', requireAuth, (req,res)=>{
  res.json({forcePasswordReset: !!req.user.force_password_reset, role: req.user.role, user: req.user});
});

// Serve the original PWA + our extra pages
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

// Fallback to original index.html
app.get('*', (req,res)=>{
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, ()=> console.log('Server v32 läuft auf Port', PORT));
