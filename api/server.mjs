import http from 'node:http';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const env=readFileSync(resolve(process.cwd(),'..','.env'),'utf8');
const password=env.match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1]?.trim();
if(!password)throw Error('Missing POSTGRES_PASSWORD in root .env');
const pool=new Pool({host:'127.0.0.1',port:5439,database:'yemekpass',user:'yemekpass',password});
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
const read=async(req)=>{let s='';for await(const c of req){s+=c;if(s.length>12000)throw Error('Request too large')}return JSON.parse(s||'{}')};
const validName=v=>typeof v==='string'&&v.trim().length>=2&&v.trim().length<=160;
const server=http.createServer(async(req,res)=>{
try{
const path=new URL(req.url,'http://127.0.0.1').pathname;
if(req.method==='GET'&&path==='/api/health'){await pool.query('select 1');return send(res,200,{ok:true})}
if(req.method==='GET'&&path==='/api/companies'){const r=await pool.query('select id,name from companies order by name');return send(res,200,r.rows)}
if(req.method==='POST'&&path==='/api/companies'){const b=await read(req);if(!validName(b.name))return send(res,400,{error:'Firma adı 2-160 karakter olmalı'});const r=await pool.query('insert into companies(id,name) values($1,$2) returning id,name',[randomUUID(),b.name.trim()]);return send(res,201,r.rows[0])}
if(req.method==='GET'&&path==='/api/restaurants'){const r=await pool.query('select id,name from restaurants order by name');return send(res,200,r.rows)}
if(req.method==='POST'&&path==='/api/restaurants'){const b=await read(req);if(!validName(b.name))return send(res,400,{error:'Lokanta adı 2-160 karakter olmalı'});const r=await pool.query('insert into restaurants(id,name) values($1,$2) returning id,name',[randomUUID(),b.name.trim()]);return send(res,201,r.rows[0])}
if(req.method==='GET'&&path==='/api/employees'){const r=await pool.query('select e.id,e.name,e.active,e.company_id,c.name as company_name from employees e join companies c on c.id=e.company_id order by c.name,e.name');return send(res,200,r.rows)}
if(req.method==='POST'&&path==='/api/employees'){const b=await read(req);if(!validName(b.name)||typeof b.company_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.company_id))return send(res,400,{error:'Geçerli personel adı ve firma seçin'});const r=await pool.query('insert into employees(id,name,company_id) values($1,$2,$3) returning id,name,company_id,active',[randomUUID(),b.name.trim(),b.company_id]);return send(res,201,r.rows[0])}
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
if(req.method==='POST'&&path==='/api/local-test/redeem'){
 const b=await read(req);
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
});
server.listen(4174,'127.0.0.1',()=>console.log('YemekPASS LOCAL API http://127.0.0.1:4174'));
