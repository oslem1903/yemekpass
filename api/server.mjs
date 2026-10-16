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
const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl)throw Error('Missing DATABASE_URL (Supabase transaction pooler URI)');
const pool=new Pool({connectionString:databaseUrl,ssl:{rejectUnauthorized:true},options:'-c search_path=yp,public',max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:10000});
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
const read=async(req)=>{let s='';for await(const c of req){s+=c;if(s.length>12000)throw Error('Request too large')}return JSON.parse(s||'{}')};
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
 res.setHeader('Set-Cookie',cookieName+'='+token+'; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=28800');
 return send(res,200,{authenticated:true});
}
if(req.method==='POST'&&path==='/api/logout'){
 res.setHeader('Set-Cookie',cookieName+'=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0');
 return send(res,200,{authenticated:false});
}
if(!validSession(req))return send(res,401,{error:'Yönetici girişi gerekli'});
if(req.method==='GET'&&path==='/api/health'){await pool.query('select 1');return send(res,200,{ok:true})}
if(req.method==='GET'&&path==='/api/companies'){const r=await pool.query('select id,name from companies order by name');return send(res,200,r.rows)}
if(req.method==='POST'&&path==='/api/companies'){const b=await read(req);if(!validName(b.name))return send(res,400,{error:'Firma adı 2-160 karakter olmalı'});const r=await pool.query('insert into companies(id,name) values($1,$2) returning id,name',[randomUUID(),b.name.trim()]);return send(res,201,r.rows[0])}
if(req.method==='GET'&&path==='/api/restaurants'){const r=await pool.query('select id,name from restaurants order by name');return send(res,200,r.rows)}
if(req.method==='POST'&&path==='/api/restaurants'){const b=await read(req);if(!validName(b.name))return send(res,400,{error:'Lokanta adı 2-160 karakter olmalı'});const r=await pool.query('insert into restaurants(id,name) values($1,$2) returning id,name',[randomUUID(),b.name.trim()]);return send(res,201,r.rows[0])}
if(req.method==='GET'&&path==='/api/employees'){const r=await pool.query('select e.id,e.name,e.active,e.company_id,c.name as company_name from employees e join companies c on c.id=e.company_id order by c.name,e.name');return send(res,200,r.rows)}
if(req.method==='POST'&&path==='/api/employees'){const b=await read(req);if(!validName(b.name)||typeof b.company_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.company_id))return send(res,400,{error:'Geçerli personel adı ve firma seçin'});const r=await pool.query('insert into employees(id,name,company_id) values($1,$2,$3) returning id,name,company_id,active',[randomUUID(),b.name.trim(),b.company_id]);return send(res,201,r.rows[0])}
if(req.method==='POST'&&path==='/api/ledger/payments'){
 const b=await read(req);
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(typeof b.agreement_id!=='string'||!uuid.test(b.agreement_id)||typeof b.idempotency_key!=='string'||!uuid.test(b.idempotency_key)||!['advance','collection'].includes(b.entry_type)||!Number.isSafeInteger(b.amount_kurus)||b.amount_kurus<1||b.amount_kurus>100000000000)return send(res,400,{error:'Geçerli anlaşma, işlem türü, tutar ve işlem anahtarı gerekli'});
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const agreement=await client.query('SELECT id,payment_model,active FROM agreements WHERE id=$1 FOR UPDATE',[b.agreement_id]);
  if(!agreement.rowCount||!agreement.rows[0].active){await client.query('ROLLBACK');return send(res,404,{error:'Aktif firma anlaşması bulunamadı'})}
  if((agreement.rows[0].payment_model==='prepaid'&&b.entry_type!=='advance')||(agreement.rows[0].payment_model==='postpaid'&&b.entry_type!=='collection')){
   await client.query('ROLLBACK');return send(res,409,{error:'Ödeme türü firma anlaşmasına uygun değil'});
  }
  const inserted=await client.query(`INSERT INTO ledger_entries(id,agreement_id,entry_type,amount_kurus)
   VALUES($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING RETURNING id,agreement_id,entry_type,amount_kurus,created_at`,[b.idempotency_key,b.agreement_id,b.entry_type,b.amount_kurus]);
  if(!inserted.rowCount){
   const previous=await client.query('SELECT id,agreement_id,entry_type,amount_kurus,created_at FROM ledger_entries WHERE id=$1',[b.idempotency_key]);
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
 FROM ledger_entries l JOIN agreements a ON a.id=l.agreement_id
 JOIN companies c ON c.id=a.company_id JOIN restaurants rest ON rest.id=a.restaurant_id
 WHERE ($1::uuid IS NULL OR l.agreement_id=$1::uuid)
 ORDER BY l.created_at DESC,l.id DESC LIMIT 1000`,[agreementId||null]);
 return send(res,200,{rows:r.rows,limit:1000});
}
if(req.method==='GET'&&path==='/api/ledger/summary'){
 const r=await pool.query(`SELECT a.id AS agreement_id,c.name AS company_name,rest.name AS restaurant_name,a.payment_model,
 COALESCE(SUM(CASE WHEN l.entry_type='advance' THEN l.amount_kurus ELSE 0 END),0)::text AS advances_kurus,
 COALESCE(SUM(CASE WHEN l.entry_type='consumption' THEN l.amount_kurus ELSE 0 END),0)::text AS consumption_kurus,
 COALESCE(SUM(CASE WHEN l.entry_type='collection' THEN l.amount_kurus ELSE 0 END),0)::text AS collections_kurus,
 COALESCE(SUM(CASE WHEN l.entry_type='reversal' THEN l.amount_kurus ELSE 0 END),0)::text AS reversals_kurus,
 COALESCE(SUM(CASE WHEN l.entry_type='allocation' THEN l.amount_kurus ELSE 0 END),0)::text AS allocations_kurus
 FROM agreements a JOIN companies c ON c.id=a.company_id JOIN restaurants rest ON rest.id=a.restaurant_id
 LEFT JOIN ledger_entries l ON l.agreement_id=a.id
 GROUP BY a.id,c.name,rest.name,a.payment_model ORDER BY c.name,rest.name`);
 return send(res,200,r.rows);
}
if(req.method==='GET'&&path==='/api/reports/company-consumption'){
 const r=await pool.query(`SELECT c.id AS company_id,c.name AS company_name,COUNT(r.id)::integer AS meal_count,
 COALESCE(SUM(r.amount_kurus),0)::text AS total_kurus
 FROM companies c LEFT JOIN employees emp ON emp.company_id=c.id
 LEFT JOIN entitlements e ON e.employee_id=emp.id
 LEFT JOIN redemptions r ON r.entitlement_id=e.id AND r.reversed_at IS NULL
 GROUP BY c.id,c.name ORDER BY c.name`);
 return send(res,200,r.rows);
}
if(req.method==='GET'&&path==='/api/redemptions'){
 const r=await pool.query(`SELECT r.id,r.created_at,r.amount_kurus,emp.name AS employee_name,c.name AS company_name,mc.name AS category_name,rest.name AS restaurant_name
 FROM redemptions r JOIN entitlements e ON e.id=r.entitlement_id JOIN employees emp ON emp.id=e.employee_id
 JOIN companies c ON c.id=emp.company_id JOIN meal_categories mc ON mc.id=e.category_id
 JOIN restaurants rest ON rest.id=r.restaurant_id ORDER BY r.created_at DESC,r.id DESC LIMIT 100`);
 return send(res,200,r.rows);
}
if(req.method==='GET'&&path==='/api/entitlements'){const r=await pool.query(`SELECT e.id,e.employee_id,e.category_id,e.granted,e.used,e.valid_from,e.valid_until,emp.name AS employee_name,mc.name AS category_name,c.name AS company_name FROM entitlements e JOIN employees emp ON emp.id=e.employee_id JOIN companies c ON c.id=emp.company_id JOIN meal_categories mc ON mc.id=e.category_id ORDER BY emp.name,mc.name`);return send(res,200,r.rows)}
if(req.method==='POST'&&path==='/api/qr/token'){
 const b=await read(req);
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(!uuid.test(b.entitlement_id))return send(res,400,{error:'Geçerli yemek hakkı seçin'});
 const found=await pool.query('SELECT id FROM entitlements WHERE id=$1',[b.entitlement_id]);
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
  const previous=await client.query('SELECT id,entitlement_id,amount_kurus FROM redemptions WHERE idempotency_key=$1',[b.idempotency_key]);
  if(previous.rowCount){
   await client.query('ROLLBACK');
   if(previous.rows[0].entitlement_id!==b.entitlement_id)return send(res,409,{error:'İşlem anahtarı başka hak için kullanılmış'});
   return send(res,200,{ok:true,repeated:true,redemption_id:previous.rows[0].id});
  }
  const r=await client.query(`SELECT e.id,e.granted,e.used,e.valid_from,e.valid_until,mc.price_kurus,a.id AS agreement_id,a.payment_model,a.restaurant_id,emp.active
  FROM entitlements e JOIN employees emp ON emp.id=e.employee_id JOIN meal_categories mc ON mc.id=e.category_id
  JOIN agreements a ON a.id=mc.agreement_id AND a.company_id=emp.company_id
  WHERE e.id=$1 AND a.active=true FOR UPDATE OF e`,[b.entitlement_id]);
  if(!r.rowCount){await client.query('ROLLBACK');return send(res,404,{error:'Aktif yemek hakkı bulunamadı'})}
  const x=r.rows[0];
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Istanbul'});
  const dateOnly=v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
  if(!x.active||x.used>=x.granted||today<dateOnly(x.valid_from)||today>dateOnly(x.valid_until)){
   await client.query('ROLLBACK');return send(res,409,{error:'Kullanılabilir yemek hakkı yok veya tarih geçersiz'});
  }
  if(x.payment_model==='prepaid'){
   const balance=await client.query(`SELECT COALESCE(SUM(CASE WHEN entry_type='advance' THEN amount_kurus WHEN entry_type='consumption' THEN -amount_kurus ELSE 0 END),0)::bigint AS balance FROM ledger_entries WHERE agreement_id=$1`,[x.agreement_id]);
   if(BigInt(balance.rows[0].balance)<BigInt(x.price_kurus)){await client.query('ROLLBACK');return send(res,409,{error:'Firma avansı yetersiz'})}
  }
  const redemptionId=randomUUID();
  await client.query('UPDATE entitlements SET used=used+1 WHERE id=$1',[x.id]);
  await client.query('INSERT INTO redemptions(id,entitlement_id,restaurant_id,amount_kurus,idempotency_key) VALUES($1,$2,$3,$4,$5)',[redemptionId,x.id,x.restaurant_id,x.price_kurus,b.idempotency_key]);
  if(BigInt(x.price_kurus)>0)await client.query("INSERT INTO ledger_entries(agreement_id,redemption_id,entry_type,amount_kurus) VALUES($1,$2,'consumption',$3)",[x.agreement_id,redemptionId,x.price_kurus]);
  await client.query('COMMIT');
  return send(res,201,{ok:true,redemption_id:redemptionId,remaining:x.granted-x.used-1,amount_kurus:Number(x.price_kurus)});
 }catch(e){await client.query('ROLLBACK');if(e.code==='23505')return send(res,409,{error:'Bu işlem zaten işlendi'});throw e}finally{client.release()}
}
if(req.method==='POST'&&path==='/api/meal-setup'){
 const b=await read(req);
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(!uuid.test(b.company_id)||!uuid.test(b.employee_id)||!validName(b.category_name)||!['prepaid','postpaid'].includes(b.payment_model)||!Number.isSafeInteger(b.price_kurus)||b.price_kurus<0||!Number.isSafeInteger(b.granted)||b.granted<1||b.granted>1000||!/^\\d{4}-\\d{2}-\\d{2}$/.test(b.valid_from)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(b.valid_until)||b.valid_until<b.valid_from)return send(res,400,{error:'Geçerli firma, personel, yemek, fiyat, adet ve tarih girin'});
 const client=await pool.connect();
 try{await client.query('BEGIN');
 const belongs=await client.query('SELECT id FROM employees WHERE id=$1 AND company_id=$2 AND active=true',[b.employee_id,b.company_id]);
 if(!belongs.rowCount){await client.query('ROLLBACK');return send(res,400,{error:'Personel seçilen firmaya ait değil'})}
 let restaurant=await client.query('SELECT id FROM restaurants ORDER BY created_at LIMIT 1');
 if(!restaurant.rowCount)restaurant=await client.query("INSERT INTO restaurants(name) VALUES('Yerel Test Lokantası') RETURNING id");
 const rid=restaurant.rows[0].id;
 let agreement=await client.query('SELECT id,payment_model FROM agreements WHERE restaurant_id=$1 AND company_id=$2 FOR UPDATE',[rid,b.company_id]);
 if(!agreement.rowCount)agreement=await client.query('INSERT INTO agreements(restaurant_id,company_id,payment_model) VALUES($1,$2,$3) RETURNING id,payment_model',[rid,b.company_id,b.payment_model]);
 if(agreement.rows[0].payment_model!==b.payment_model){await client.query('ROLLBACK');return send(res,409,{error:'Firmanın mevcut ödeme modeli farklı; önce anlaşma düzenleme akışı gerekli'})}
 const aid=agreement.rows[0].id;
 let category=await client.query('SELECT id,price_kurus FROM meal_categories WHERE agreement_id=$1 AND name=$2',[aid,b.category_name.trim()]);
 if(!category.rowCount)category=await client.query('INSERT INTO meal_categories(agreement_id,name,price_kurus) VALUES($1,$2,$3) RETURNING id,price_kurus',[aid,b.category_name.trim(),b.price_kurus]);
 if(Number(category.rows[0].price_kurus)!==b.price_kurus){await client.query('ROLLBACK');return send(res,409,{error:'Bu yemek türü farklı fiyatla kayıtlı'})}
 const exists=await client.query('SELECT id FROM entitlements WHERE employee_id=$1 AND category_id=$2 AND valid_from=$3 AND valid_until=$4',[b.employee_id,category.rows[0].id,b.valid_from,b.valid_until]);
 if(exists.rowCount){await client.query('ROLLBACK');return send(res,409,{error:'Aynı personel, yemek türü ve tarih için hak zaten tanımlanmış'})}
 const result=await client.query('INSERT INTO entitlements(employee_id,category_id,valid_from,valid_until,granted) VALUES($1,$2,$3,$4,$5) RETURNING id,granted,used',[b.employee_id,category.rows[0].id,b.valid_from,b.valid_until,b.granted]);
 await client.query('COMMIT');return send(res,201,result.rows[0]);
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
return send(res,404,{error:'Endpoint bulunamadı'});
}catch(e){if(e.code==='23503')return send(res,400,{error:'Firma bulunamadı'});if(e instanceof SyntaxError)return send(res,400,{error:'Geçersiz JSON'});console.error(e);return send(res,500,{error:'İşlem başarısız'})}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 http.createServer(handler).listen(4174,'127.0.0.1',()=>console.log('YemekPASS local API on port 4174'));
}
