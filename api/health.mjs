import {Pool} from 'pg';
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 res.setHeader('Cache-Control','no-store');
 const raw=process.env.POSTGRES_URL||process.env.DATABASE_URL;
 if(!raw)return res.status(503).json({ok:false,database:false,reason:'configuration_missing'});
 let pool;
 try{
  const u=new URL(raw);
  const ca=process.env.SUPABASE_DB_CA_CERT?.replace(/\\n/g,'\n');
  pool=new Pool({host:u.hostname,port:Number(u.port||5432),user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:decodeURIComponent(u.pathname.slice(1)),ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},connectionTimeoutMillis:8000,max:1});
  await pool.query('SELECT 1');
  const required=['companies','employees','restaurants','agreements','meal_categories','entitlements','ledger_entries'];
  const found=await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='yp' AND table_name = ANY($1::text[])",[required]);
  const available=new Set(found.rows.map(row=>row.table_name));
  const missing=required.filter(name=>!available.has(name));
  if(missing.length)return res.status(503).json({ok:false,database:true,schemaReady:false,missingTables:missing});
  await pool.query('SELECT count(*) FROM yp.companies');
  await pool.query('SELECT count(*) FROM yp.employees');
  const checks={
   restaurants:"SELECT id,name FROM yp.restaurants LIMIT 1",
   entitlements:"SELECT e.id,e.granted,e.used,emp.name,mc.name FROM yp.entitlements e JOIN yp.employees emp ON emp.id=e.employee_id JOIN yp.meal_categories mc ON mc.id=e.category_id LIMIT 1",
   redemptions:"SELECT r.id,r.amount_kurus,rest.name FROM yp.redemptions r JOIN yp.restaurants rest ON rest.id=r.restaurant_id LIMIT 1",
   agreements:"SELECT a.id,a.payment_model,c.name FROM yp.agreements a JOIN yp.companies c ON c.id=a.company_id LIMIT 1",
   ledger:"SELECT l.id,l.amount_kurus,l.entry_type FROM yp.ledger_entries l LIMIT 1",
   consumptionReport:"SELECT c.id,COUNT(r.id)::integer AS meals FROM yp.companies c LEFT JOIN yp.employees emp ON emp.company_id=c.id LEFT JOIN yp.entitlements e ON e.employee_id=emp.id LEFT JOIN yp.redemptions r ON r.entitlement_id=e.id AND r.reversed_at IS NULL GROUP BY c.id LIMIT 1"
  };
  const results={};
  for(const [name,sql] of Object.entries(checks)){
   try{await pool.query(sql);results[name]=true;}
   catch(e){results[name]=false;console.error('YemekPASS read-only check failed',name,e.code||e.name);}
  }
  const allPassed=Object.values(results).every(Boolean);
  return res.status(allPassed?200:503).json({ok:allPassed,database:true,schemaReady:true,companyQuery:true,employeeQuery:true,readOnlyChecks:results});
 }catch(e){
  console.error('YemekPASS database health check failed',e.code||e.name);
  return res.status(503).json({ok:false,database:false,errorCode:e.code||'CONNECTION_FAILED'});
 }finally{if(pool)await pool.end().catch(()=>{});}
}
