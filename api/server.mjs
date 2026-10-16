import http from 'node:http';
import {Pool} from 'pg';
import {randomUUID,randomBytes,scryptSync,timingSafeEqual,createHmac} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const adminPassword=process.env.YEMEKPASS_ADMIN_PASSWORD;
if(!adminPassword||adminPassword.length<16)throw Error('Set YEMEKPASS_ADMIN_PASSWORD (at least 16 characters) in root .env');
const salt=randomBytes(32);
const passwordHash=scryptSync(adminPassword,salt,64);
const qrSecret=process.env.YEMEKPASS_QR_SECRET ? Buffer.from(process.env.YEMEKPASS_QR_SECRET,'utf8') : null;
if(!qrSecret||qrSecret.length<32)throw Error('Set YEMEKPASS_QR_SECRET to a stable random secret of at least 32 bytes');
const sessionSecret=process.env.YEMEKPASS_SESSION_SECRET;
if(!sessionSecret||sessionSecret.length<32)throw Error('Set YEMEKPASS_SESSION_SECRET to a stable random secret of at least 32 characters');
const qrSign=data=>createHmac('sha256',qrSecret).update(data).digest('base64url');
const qrVerify=token=>{
 if(typeof token!=='string'||token.length>512)return null;
 const parts=token.split('.');if(parts.length!==2)return null;
 const [payload,signature]=parts;
 const expected=qrSign(payload);
 const x=Buffer.from(signature),y=Buffer.from(expected);
 if(x.length!==y.length||!timingSafeEqual(x,y))return null;
 try{const value=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));if(!Number.isSafeInteger(value.exp)||value.exp<Date.now()||value.exp>Date.now()+120000)return null;return value}catch{return null}
};
const loginFailures=new Map();
const sessionDurationMs=8*60*60*1000;
const cookieName='yp_session';
const cookieValue=req=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
const signSession=payload=>createHmac('sha256',sessionSecret).update(payload).digest('base64url');
const validSession=req=>{const token=cookieValue(req);if(!token||token.length>256)return false;const parts=token.split('.');if(parts.length!==2)return false;const [payload,signature]=parts;const expected=signSession(payload);if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return false;try{const value=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));return Number.isSafeInteger(value.exp)&&value.exp>Date.now()&&value.exp<=Date.now()+sessionDurationMs}catch{return false}};
const databaseUrl=process.env.POSTGRES_URL || process.env.DATABASE_URL;
if(!databaseUrl)throw Error('Missing DATABASE_URL (Supabase transaction pooler URI)');
const dbUrl=new URL(databaseUrl);
const dbCa=process.env.SUPABASE_DB_CA_CERT?.replace(/\\n/g,'\n');
const sslParams=['sslmode','sslrootcert','sslcert','sslkey'];
for(const param of sslParams)dbUrl.searchParams.delete(param);
const pool=new Pool({host:dbUrl.hostname,port:Number(dbUrl.port||5432),user:decodeURIComponent(dbUrl.username),password:decodeURIComponent(dbUrl.password),database:decodeURIComponent(dbUrl.pathname.slice(1)),ssl:{rejectUnauthorized:true,...(dbCa?{ca:dbCa}:{})},max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:10000});
// Always address the isolated YemekPASS schema explicitly.

const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
const read=async(req)=>{if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;let s='';for await(const c of req){s+=c;if(s.length>12000)throw Error('Request too large')}return JSON.parse(s||'{}')};
const validName=v=>typeof v==='string'&&v.trim().length>=2&&v.trim().length<=160;
export default async function handler(req,res){
try{
const path=new URL(req.url,'http://127.0.0.1').pathname;
const origin=req.headers.origin;
if(!['GET','HEAD','OPTIONS'].includes(req.method)){
 const allowed=new Set(['http://localhost:5173','http://127.0.0.1:5173']);
 const host=req.headers.host;
 if(host&&/^[a-z0-9.-]+(?::\d+)?$/i.test(host))allowed.add('https://'+host);
 if(!origin||!allowed.has(origin))return send(res,403,{error:'İstek yalnızca yerel YemekPASS arayüzünden yapılabilir'});
 const type=(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
 if(type!=='application/json')return send(res,415,{error:'JSON içerik türü gerekli'});
}

if(req.method==='GET'&&path==='/api/health'){await pool.query('select 1');return send(res,200,{ok:true})}
if(req.method==='GET'&&path==='/api/session')return send(res,200,{authenticated:validSession(req)});
if(req.method==='POST'&&path==='/api/login'){
 const key=req.headers['x-forwarded-for']?.split(',')[0]?.trim()||req.socket?.remoteAddress||'local';
 const attempts=loginFailures.get(key)||{count:0,until:0};
 if(attempts.until>Date.now())return send(res,429,{error:'Çok fazla hatalı giriş. Biraz bekleyin'});
 const b=await read(req);
 if(typeof b.password!=='string'||b.password.length>1024)return send(res,400,{error:'Geçersiz parola'});
 const candidate=scryptSync(b.password,salt,64);
 if(!timingSafeEqual(candidate,passwordHash)){
  attempts.count++;
  if(attempts.count>=5){attempts.until=Date.now()+15*60*1000;attempts.count=0}
  loginFailures.set(key,attempts);
  return send(res,401,{error:'Parola hatalı'});
 }
 loginFailures.delete(key);
 const payload=Buffer.from(JSON.stringify({exp:Date.now()+sessionDurationMs,nonce:randomUUID()})).toString('base64url');
 const token=payload+'.'+signSession(payload);
 res.setHeader('Set-Cookie',cookieName+'='+token+'; HttpOnly; '+(req.headers.host?.startsWith('localhost')||req.headers.host?.startsWith('127.0.0.1')?'':'Secure; ')+'SameSite=Strict; Path=/api; Max-Age=28800');
 return send(res,200,{authenticated:true});
}
if(req.method==='POST'&&path==='/api/logout'){
 res.setHeader('Set-Cookie',cookieName+'=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0');
 return send(res,200,{authenticated:false});
}
// Scoped portal credentials are random, stored only as HMAC hashes, and never expose admin APIs.
const portalAuth=async()=>{
 const auth=req.headers.authorization||'';
 if(!auth.startsWith('Bearer '))return null;
 const token=auth.slice(7);
 if(!/^[0-9a-f]{64}$/i.test(token))return null;
 const hash=createHmac('sha256',sessionSecret).update(token).digest('hex');
 const account=await pool.query('SELECT role,company_id,restaurant_id,employee_id FROM yp.portal_accounts WHERE token_hash=$1 AND active=true',[hash]);
 return account.rows[0]||null;
};
if(req.method==='GET'&&path==='/api/portal/me'){
 const a=await portalAuth();if(!a)return send(res,401,{error:'Portal erişimi geçersiz'});
 return send(res,200,{role:a.role,company_id:a.company_id,restaurant_id:a.restaurant_id,employee_id:a.employee_id});
}
if(req.method==='GET'&&path==='/api/portal/overview'){
 const a=await portalAuth();if(!a)return send(res,401,{error:'Portal erişimi geçersiz'});
 if(a.role==='company'){
  const employees=await pool.query('SELECT id,name,active FROM yp.employees WHERE company_id=$1 ORDER BY name',[a.company_id]);
  const agreements=await pool.query('SELECT a.id,r.name AS restaurant_name,a.payment_model FROM yp.agreements a JOIN yp.restaurants r ON r.id=a.restaurant_id WHERE a.company_id=$1',[a.company_id]);
  return send(res,200,{role:a.role,employees:employees.rows,agreements:agreements.rows});
 }
 if(a.role==='restaurant'){
  const sales=await pool.query('SELECT r.id,r.created_at,r.amount_kurus,c.name AS company_name FROM yp.redemptions r JOIN yp.entitlements e ON e.id=r.entitlement_id JOIN yp.employees emp ON emp.id=e.employee_id JOIN yp.companies c ON c.id=emp.company_id WHERE r.restaurant_id=$1 AND r.reversed_at IS NULL ORDER BY r.created_at DESC LIMIT 100',[a.restaurant_id]);
  return send(res,200,{role:a.role,sales:sales.rows});
 }
 const entitlements=await pool.query('SELECT e.id,e.granted,e.used,e.valid_from,e.valid_until,mc.name AS meal_name FROM yp.entitlements e JOIN yp.meal_categories mc ON mc.id=e.category_id WHERE e.employee_id=$1 ORDER BY e.valid_until DESC',[a.employee_id]);
 return send(res,200,{role:a.role,entitlements:entitlements.rows});
}
if(req.method==='POST'&&path==='/api/portal/employee-qr'){
 const a=await portalAuth();if(!a||a.role!=='employee')return send(res,403,{error:'Çalışan erişimi gerekli'});
 const b=await read(req);
 const entitlement=await pool.query('SELECT id FROM yp.entitlements WHERE id=$1 AND employee_id=$2 AND used<granted AND current_date BETWEEN valid_from AND valid_until',[b.entitlement_id,a.employee_id]);
 if(!entitlement.rowCount)return send(res,404,{error:'Aktif yemek hakkı bulunamadı'});
 const exp=Date.now()+60000;
 const payload=Buffer.from(JSON.stringify({entitlement_id:b.entitlement_id,exp,nonce:randomUUID()})).toString('base64url');
 return send(res,200,{token:payload+'.'+qrSign(payload),expires_at:new Date(exp).toISOString()});
}
if(!validSession(req))return send(res,401,{error:'Yönetici girişi gerekli'});
if(req.method==='POST'&&path==='/api/portal/accounts'){
 const b=await read(req);
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const table={company:'companies',restaurant:'restaurants',employee:'employees'}[b.role];
 if(!table||!uuid.test(b.subject_id))return send(res,400,{error:'Geçerli rol ve kayıt gerekli'});
 const found=await pool.query('SELECT id FROM yp.'+table+' WHERE id=$1',[b.subject_id]);
 if(!found.rowCount)return send(res,404,{error:'Kayıt bulunamadı'});
 const token=randomBytes(32).toString('hex');
 const hash=createHmac('sha256',sessionSecret).update(token).digest('hex');
 const column={company:'company_id',restaurant:'restaurant_id',employee:'employee_id'}[b.role];
 await pool.query('INSERT INTO yp.portal_accounts(role,'+column+',token_hash) VALUES($1,$2,$3)',[b.role,b.subject_id,hash]);
 return send(res,201,{role:b.role,token,warning:'Bu erişim anahtarı yalnızca bir kez gösterilir. Güvenli biçimde teslim edin.'});
}

if(req.method==='GET'&&path==='/api/health'){await pool.query('select 1');return send(res,200,{ok:true})}
if(req.method==='GET'&&path==='/api/companies'){const r=await pool.query('select id,name from yp.companies order by name');return send(res,200,r.rows)}
if(req.method==='POST'&&path==='/api/companies'){const b=await read(req);if(!validName(b.name))return send(res,400,{error:'Firma adı 2-160 karakter olmalı'});const r=await pool.query('insert into yp.companies(id,name) values($1,$2) returning id,name',[randomUUID(),b.name.trim()]);return send(res,201,r.rows[0])}
if(req.method==='GET'&&path==='/api/restaurants'){const r=await pool.query('select id,name from yp.restaurants order by name');return send(res,200,r.rows)}
if(req.method==='POST'&&path==='/api/restaurants'){const b=await read(req);if(!validName(b.name))return send(res,400,{error:'Lokanta adı 2-160 karakter olmalı'});const r=await pool.query('insert into yp.restaurants(id,name) values($1,$2) returning id,name',[randomUUID(),b.name.trim()]);return send(res,201,r.rows[0])}
if(req.method==='GET'&&path==='/api/employees'){const r=await pool.query('select e.id,e.name,e.active,e.company_id,c.name as company_name from yp.employees e join yp.companies c on c.id=e.company_id order by c.name,e.name');return send(res,200,r.rows)}
if(req.method==='POST'&&path==='/api/employees'){const b=await read(req);if(!validName(b.name)||typeof b.company_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.company_id))return send(res,400,{error:'Geçerli personel adı ve firma seçin'});const r=await pool.query('insert into yp.employees(id,name,company_id) values($1,$2,$3) returning id,name,company_id,active',[randomUUID(),b.name.trim(),b.company_id]);return send(res,201,r.rows[0])}
if(req.method==='POST'&&path==='/api/ledger/payments'){
 const b=await read(req);
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(typeof b.agreement_id!=='string'||!uuid.test(b.agreement_id)||typeof b.idempotency_key!=='string'||!uuid.test(b.idempotency_key)||!['advance','collection'].includes(b.entry_type)||!Number.isSafeInteger(b.amount_kurus)||b.amount_kurus<1||b.amount_kurus>100000000000)return send(res,400,{error:'Geçerli anlaşma, işlem türü, tutar ve işlem anahtarı gerekli'});
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const agreement=await client.query('SELECT id,payment_model,active FROM yp.agreements WHERE id=$1 FOR UPDATE',[b.agreement_id]);
  if(!agreement.rowCount||!agreement.rows[0].active){await client.query('ROLLBACK');return send(res,404,{error:'Aktif firma anlaşması bulunamadı'})}
  if((agreement.rows[0].payment_model==='prepaid'&&b.entry_type!=='advance')||(agreement.rows[0].payment_model==='postpaid'&&b.entry_type!=='collection')){
   await client.query('ROLLBACK');return send(res,409,{error:'Ödeme türü firma anlaşmasına uygun değil'});
  }
  const inserted=await client.query(`INSERT INTO yp.ledger_entries(id,agreement_id,entry_type,amount_kurus)
   VALUES($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING RETURNING id,agreement_id,entry_type,amount_kurus,created_at`,[b.idempotency_key,b.agreement_id,b.entry_type,b.amount_kurus]);
  if(!inserted.rowCount){
   const previous=await client.query('SELECT id,agreement_id,entry_type,amount_kurus,created_at FROM yp.ledger_entries WHERE id=$1',[b.idempotency_key]);
   await client.query('ROLLBACK');
   if(!previous.rowCount||previous.rows[0].agreement_id!==b.agreement_id||previous.rows[0].entry_type!==b.entry_type||BigInt(previous.rows[0].amount_kurus)!==BigInt(b.amount_kurus))return send(res,409,{error:'İşlem anahtarı farklı bir işlemde kullanılmış'});
   return send(res,200,{ok:true,repeated:true,payment:previous.rows[0]});
  }
  await client.query('COMMIT');
  return send(res,201,{ok:true,repeated:false,payment:inserted.rows[0]});
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
if(req.method==='GET'&&path==='/api/ledger/movements'){
 const u=new URL(req.url,'http://127.0.0.1');
 const agreementId=u.searchParams.get('agreement_id');
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(agreementId&&!uuid.test(agreementId))return send(res,400,{error:'Geçersiz anlaşma'});
 const r=await pool.query(`SELECT l.id,l.agreement_id,l.entry_type,l.amount_kurus::text AS amount_kurus,l.created_at,
 c.name AS company_name,rest.name AS restaurant_name
 FROM yp.ledger_entries l JOIN yp.agreements a ON a.id=l.agreement_id
 JOIN yp.companies c ON c.id=a.company_id JOIN yp.restaurants rest ON rest.id=a.restaurant_id
 WHERE ($1::uuid IS NULL OR l.agreement_id=$1::uuid)
 ORDER BY l.created_at DESC,l.id DESC LIMIT 1000`,[agreementId||null]);
 return send(res,200,{rows:r.rows,limit:1000});
}
if(req.method==='GET'&&path==='/api/ledger/reconciliation'){
 const r=await pool.query(`SELECT a.id AS agreement_id,c.name AS company_name,rest.name AS restaurant_name,a.payment_model,
 COALESCE(SUM(CASE WHEN l.entry_type='advance' THEN l.amount_kurus ELSE 0 END),0)::text AS advances_kurus,
 COALESCE(SUM(CASE WHEN l.entry_type='consumption' THEN l.amount_kurus ELSE 0 END),0)::text AS consumption_kurus,
 COALESCE(SUM(CASE WHEN l.entry_type='collection' THEN l.amount_kurus ELSE 0 END),0)::text AS collections_kurus,
 COALESCE(SUM(CASE WHEN l.entry_type='reversal' THEN l.amount_kurus ELSE 0 END),0)::text AS reversals_kurus,
 COALESCE(SUM(CASE WHEN l.entry_type='allocation' THEN l.amount_kurus ELSE 0 END),0)::text AS allocations_kurus,
 (CASE WHEN a.payment_model='prepaid' THEN
 COALESCE(SUM(CASE WHEN l.entry_type='advance' THEN l.amount_kurus WHEN l.entry_type='consumption' THEN -l.amount_kurus WHEN l.entry_type='reversal' THEN l.amount_kurus ELSE 0 END),0)
 ELSE
 COALESCE(SUM(CASE WHEN l.entry_type='consumption' THEN l.amount_kurus WHEN l.entry_type='reversal' THEN -l.amount_kurus WHEN l.entry_type='collection' THEN -l.amount_kurus ELSE 0 END),0)
 END)::text AS balance_kurus,
 (COUNT(l.id) FILTER (WHERE l.entry_type='allocation')>0) AS needs_allocation_review
 FROM yp.agreements a JOIN yp.companies c ON c.id=a.company_id JOIN yp.restaurants rest ON rest.id=a.restaurant_id
 LEFT JOIN yp.ledger_entries l ON l.agreement_id=a.id
 GROUP BY a.id,c.name,rest.name,a.payment_model ORDER BY c.name,rest.name`);
 return send(res,200,{rows:r.rows,balanceMeaning:{prepaid:'available_credit',postpaid:'amount_due'},allocationWarning:'Balances exclude allocation entries; review flagged agreements'});
}
if(req.method==='GET'&&path==='/api/ledger/summary'){
 const r=await pool.query(`SELECT a.id AS agreement_id,c.name AS company_name,rest.name AS restaurant_name,a.payment_model,
 COALESCE(SUM(CASE WHEN l.entry_type='advance' THEN l.amount_kurus ELSE 0 END),0)::text AS advances_kurus,
 COALESCE(SUM(CASE WHEN l.entry_type='consumption' THEN l.amount_kurus ELSE 0 END),0)::text AS consumption_kurus,
 COALESCE(SUM(CASE WHEN l.entry_type='collection' THEN l.amount_kurus ELSE 0 END),0)::text AS collections_kurus,
 COALESCE(SUM(CASE WHEN l.entry_type='reversal' THEN l.amount_kurus ELSE 0 END),0)::text AS reversals_kurus,
 COALESCE(SUM(CASE WHEN l.entry_type='allocation' THEN l.amount_kurus ELSE 0 END),0)::text AS allocations_kurus
 FROM yp.agreements a JOIN yp.companies c ON c.id=a.company_id JOIN yp.restaurants rest ON rest.id=a.restaurant_id
 LEFT JOIN yp.ledger_entries l ON l.agreement_id=a.id
 GROUP BY a.id,c.name,rest.name,a.payment_model ORDER BY c.name,rest.name`);
 return send(res,200,r.rows);
}
if(req.method==='GET'&&path==='/api/reports/company-consumption'){
 const r=await pool.query(`SELECT c.id AS company_id,c.name AS company_name,COUNT(r.id)::integer AS meal_count,
 COALESCE(SUM(r.amount_kurus),0)::text AS total_kurus
 FROM yp.companies c LEFT JOIN yp.employees emp ON emp.company_id=c.id
 LEFT JOIN yp.entitlements e ON e.employee_id=emp.id
 LEFT JOIN yp.redemptions r ON r.entitlement_id=e.id AND r.reversed_at IS NULL
 GROUP BY c.id,c.name ORDER BY c.name`);
 return send(res,200,r.rows);
}
if(req.method==='GET'&&path==='/api/redemptions'){
 const r=await pool.query(`SELECT r.id,r.created_at,r.amount_kurus,emp.name AS employee_name,c.name AS company_name,mc.name AS category_name,rest.name AS restaurant_name
 FROM yp.redemptions r JOIN yp.entitlements e ON e.id=r.entitlement_id JOIN yp.employees emp ON emp.id=e.employee_id
 JOIN yp.companies c ON c.id=emp.company_id JOIN yp.meal_categories mc ON mc.id=e.category_id
 JOIN yp.restaurants rest ON rest.id=r.restaurant_id ORDER BY r.created_at DESC,r.id DESC LIMIT 100`);
 return send(res,200,r.rows);
}
if(req.method==='GET'&&path==='/api/entitlements'){const r=await pool.query(`SELECT e.id,e.employee_id,e.category_id,e.granted,e.used,e.valid_from,e.valid_until,emp.name AS employee_name,mc.name AS category_name,c.name AS company_name FROM yp.entitlements e JOIN yp.employees emp ON emp.id=e.employee_id JOIN yp.companies c ON c.id=emp.company_id JOIN yp.meal_categories mc ON mc.id=e.category_id ORDER BY emp.name,mc.name`);return send(res,200,r.rows)}
if(req.method==='POST'&&path==='/api/qr/token'){
 const b=await read(req);
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(!uuid.test(b.entitlement_id))return send(res,400,{error:'Geçerli yemek hakkı seçin'});
 const found=await pool.query('SELECT id FROM yp.entitlements WHERE id=$1',[b.entitlement_id]);
 if(!found.rowCount)return send(res,404,{error:'Yemek hakkı bulunamadı'});
 const exp=Date.now()+60000;
 const payload=Buffer.from(JSON.stringify({entitlement_id:b.entitlement_id,exp,nonce:randomUUID()})).toString('base64url');
 return send(res,200,{token:payload+'.'+qrSign(payload),expires_at:new Date(exp).toISOString(),test_only:true});
}
if(req.method==='POST'&&(path==='/api/local-test/redeem'||path==='/api/qr/redeem')){
 const b=await read(req);
 if(path==='/api/qr/redeem'){const verified=qrVerify(b.token);if(!verified)return send(res,401,{error:'QR süresi dolmuş veya kod geçersiz'});b.entitlement_id=verified.entitlement_id;b.idempotency_key=verified.nonce}
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(!uuid.test(b.entitlement_id)||!uuid.test(b.idempotency_key))return send(res,400,{error:'Geçerli hak ve işlem anahtarı gerekli'});
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const previous=await client.query('SELECT id,entitlement_id,amount_kurus FROM yp.redemptions WHERE idempotency_key=$1',[b.idempotency_key]);
  if(previous.rowCount){
   await client.query('ROLLBACK');
   if(previous.rows[0].entitlement_id!==b.entitlement_id)return send(res,409,{error:'İşlem anahtarı başka hak için kullanılmış'});
   return send(res,200,{ok:true,repeated:true,redemption_id:previous.rows[0].id});
  }
  const r=await client.query(`SELECT e.id,e.granted,e.used,e.valid_from,e.valid_until,mc.price_kurus,a.id AS agreement_id,a.payment_model,a.restaurant_id,emp.active
  FROM yp.entitlements e JOIN yp.employees emp ON emp.id=e.employee_id JOIN yp.meal_categories mc ON mc.id=e.category_id
  JOIN yp.agreements a ON a.id=mc.agreement_id AND a.company_id=emp.company_id
  WHERE e.id=$1 AND a.active=true FOR UPDATE OF e`,[b.entitlement_id]);
  if(!r.rowCount){await client.query('ROLLBACK');return send(res,404,{error:'Aktif yemek hakkı bulunamadı'})}
  const x=r.rows[0];
  // Serialize prepaid redemptions for the same agreement to prevent overspending.
  if(x.payment_model==='prepaid')await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[x.agreement_id]);
  const policy=await client.query('SELECT daily_limit,start_time::text,end_time::text,weekdays FROM yp.meal_policies WHERE agreement_id=$1',[x.agreement_id]);
  const rule=policy.rows[0]||{daily_limit:1,start_time:'00:00:00',end_time:'23:59:59',weekdays:[1,2,3,4,5,6,7]};
  const istanbulParts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const part=key=>istanbulParts.find(x=>x.type===key)?.value;
  const weekdayNumber={Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7}[part('weekday')];
  const localTime=part('hour')+':'+part('minute');
  if(!rule.weekdays.includes(weekdayNumber)||localTime<rule.start_time.slice(0,5)||localTime>rule.end_time.slice(0,5)){
   await client.query('ROLLBACK');return send(res,409,{error:'Yemek kullanımı bugün veya bu saat aralığında kapalı'});
  }
  const usedToday=await client.query(`SELECT count(*)::integer AS total FROM yp.redemptions
    WHERE entitlement_id IN (SELECT id FROM yp.entitlements WHERE employee_id=(SELECT employee_id FROM yp.entitlements WHERE id=$1))
    AND reversed_at IS NULL AND (created_at AT TIME ZONE 'Europe/Istanbul')::date=(now() AT TIME ZONE 'Europe/Istanbul')::date
    AND restaurant_id=$2`,[b.entitlement_id,x.restaurant_id]);
  if(usedToday.rows[0].total>=rule.daily_limit){
   await client.query('ROLLBACK');return send(res,409,{error:'Günlük yemek kullanım limitine ulaşıldı'});
  }
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dateOnly=v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
  if(!x.active||x.used>=x.granted||today<dateOnly(x.valid_from)||today>dateOnly(x.valid_until)){
   await client.query('ROLLBACK');return send(res,409,{error:'Kullanılabilir yemek hakkı yok veya tarih geçersiz'});
  }
  if(x.payment_model==='prepaid'){
   const balance=await client.query(`SELECT COALESCE(SUM(CASE WHEN entry_type='advance' THEN amount_kurus WHEN entry_type='consumption' THEN -amount_kurus WHEN entry_type='reversal' THEN amount_kurus ELSE 0 END),0)::bigint AS balance FROM yp.ledger_entries WHERE agreement_id=$1`,[x.agreement_id]);
   if(BigInt(balance.rows[0].balance)<BigInt(x.price_kurus)){await client.query('ROLLBACK');return send(res,409,{error:'Firma avansı yetersiz'})}
  }
  const redemptionId=randomUUID();
  await client.query('UPDATE yp.entitlements SET used=used+1 WHERE id=$1',[x.id]);
  await client.query('INSERT INTO yp.redemptions(id,entitlement_id,restaurant_id,amount_kurus,idempotency_key) VALUES($1,$2,$3,$4,$5)',[redemptionId,x.id,x.restaurant_id,x.price_kurus,b.idempotency_key]);
  if(BigInt(x.price_kurus)>0)await client.query("INSERT INTO yp.ledger_entries(agreement_id,redemption_id,entry_type,amount_kurus) VALUES($1,$2,'consumption',$3)",[x.agreement_id,redemptionId,x.price_kurus]);
  await client.query('COMMIT');
  return send(res,201,{ok:true,redemption_id:redemptionId,remaining:x.granted-x.used-1,amount_kurus:Number(x.price_kurus)});
 }catch(e){await client.query('ROLLBACK');if(e.code==='23505')return send(res,409,{error:'Bu işlem zaten işlendi'});throw e}finally{client.release()}
}
if(req.method==='POST'&&path==='/api/redemptions/reverse'){
 const b=await read(req);
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(!uuid.test(b.redemption_id)||typeof b.reason!=='string'||b.reason.trim().length<5||b.reason.trim().length>500)return send(res,400,{error:'Geçerli tüketim ve en az 5 karakterlik iptal gerekçesi gerekli'});
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const row=await client.query(`SELECT r.id,r.entitlement_id,r.reversed_at,r.amount_kurus,a.id AS agreement_id
   FROM yp.redemptions r JOIN yp.entitlements e ON e.id=r.entitlement_id
   JOIN yp.meal_categories mc ON mc.id=e.category_id JOIN yp.agreements a ON a.id=mc.agreement_id
   WHERE r.id=$1 FOR UPDATE OF r`,[b.redemption_id]);
  if(!row.rowCount){await client.query('ROLLBACK');return send(res,404,{error:'Tüketim bulunamadı'})}
  const x=row.rows[0];
  if(x.reversed_at){await client.query('ROLLBACK');return send(res,409,{error:'Bu tüketim zaten iptal edilmiş'})}
  await client.query('UPDATE yp.redemptions SET reversed_at=now() WHERE id=$1',[x.id]);
  const decremented=await client.query('UPDATE yp.entitlements SET used=used-1 WHERE id=$1 AND used>0 RETURNING id',[x.entitlement_id]);
  if(!decremented.rowCount)throw Error('Entitlement count inconsistent during reversal');
  await client.query('INSERT INTO yp.reversal_audit(redemption_id,reason,reversed_by) VALUES($1,$2,$3)',[x.id,b.reason.trim(),'admin']);
  if(BigInt(x.amount_kurus)>0)await client.query("INSERT INTO yp.ledger_entries(agreement_id,redemption_id,entry_type,amount_kurus) VALUES($1,$2,'reversal',$3)",[x.agreement_id,x.id,x.amount_kurus]);
  await client.query('COMMIT');return send(res,200,{ok:true,reversed:true});
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
if(req.method==='POST'&&path==='/api/meal-setup'){
 const b=await read(req);
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(!uuid.test(b.company_id)||!uuid.test(b.employee_id)||!validName(b.category_name)||!['prepaid','postpaid'].includes(b.payment_model)||!Number.isSafeInteger(b.price_kurus)||b.price_kurus<0||!Number.isSafeInteger(b.granted)||b.granted<1||b.granted>1000||!/^\\d{4}-\\d{2}-\\d{2}$/.test(b.valid_from)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(b.valid_until)||b.valid_until<b.valid_from)return send(res,400,{error:'Geçerli firma, personel, yemek, fiyat, adet ve tarih girin'});
 const client=await pool.connect();
 try{await client.query('BEGIN');
 const belongs=await client.query('SELECT id FROM yp.employees WHERE id=$1 AND company_id=$2 AND active=true',[b.employee_id,b.company_id]);
 if(!belongs.rowCount){await client.query('ROLLBACK');return send(res,400,{error:'Personel seçilen firmaya ait değil'})}
 let restaurant=await client.query('SELECT id FROM yp.restaurants ORDER BY created_at LIMIT 1');
 if(!restaurant.rowCount)restaurant=await client.query("INSERT INTO yp.restaurants(name) VALUES('Yerel Test Lokantası') RETURNING id");
 const rid=restaurant.rows[0].id;
 let agreement=await client.query('SELECT id,payment_model FROM yp.agreements WHERE restaurant_id=$1 AND company_id=$2 FOR UPDATE',[rid,b.company_id]);
 if(!agreement.rowCount)agreement=await client.query('INSERT INTO yp.agreements(restaurant_id,company_id,payment_model) VALUES($1,$2,$3) RETURNING id,payment_model',[rid,b.company_id,b.payment_model]);
 if(agreement.rows[0].payment_model!==b.payment_model){await client.query('ROLLBACK');return send(res,409,{error:'Firmanın mevcut ödeme modeli farklı; önce anlaşma düzenleme akışı gerekli'})}
 const aid=agreement.rows[0].id;
 let category=await client.query('SELECT id,price_kurus FROM yp.meal_categories WHERE agreement_id=$1 AND name=$2',[aid,b.category_name.trim()]);
 if(!category.rowCount)category=await client.query('INSERT INTO yp.meal_categories(agreement_id,name,price_kurus) VALUES($1,$2,$3) RETURNING id,price_kurus',[aid,b.category_name.trim(),b.price_kurus]);
 if(Number(category.rows[0].price_kurus)!==b.price_kurus){await client.query('ROLLBACK');return send(res,409,{error:'Bu yemek türü farklı fiyatla kayıtlı'})}
 const exists=await client.query('SELECT id FROM yp.entitlements WHERE employee_id=$1 AND category_id=$2 AND valid_from=$3 AND valid_until=$4',[b.employee_id,category.rows[0].id,b.valid_from,b.valid_until]);
 if(exists.rowCount){await client.query('ROLLBACK');return send(res,409,{error:'Aynı personel, yemek türü ve tarih için hak zaten tanımlanmış'})}
 const result=await client.query('INSERT INTO yp.entitlements(employee_id,category_id,valid_from,valid_until,granted) VALUES($1,$2,$3,$4,$5) RETURNING id,granted,used',[b.employee_id,category.rows[0].id,b.valid_from,b.valid_until,b.granted]);
 await client.query('COMMIT');return send(res,201,result.rows[0]);
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
return send(res,404,{error:'Endpoint bulunamadı'});
}catch(e){if(e.code==='23503')return send(res,400,{error:'Firma bulunamadı'});if(e instanceof SyntaxError)return send(res,400,{error:'Geçersiz JSON'});console.error(e);return send(res,500,{error:'İşlem başarısız'})}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 http.createServer(handler).listen(4174,'127.0.0.1',()=>console.log('YemekPASS local API on port 4174'));
}
