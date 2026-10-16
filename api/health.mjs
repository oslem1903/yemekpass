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
  return res.status(200).json({ok:true,database:true});
 }catch(e){
  console.error('YemekPASS database health check failed',e.code||e.name);
  return res.status(503).json({ok:false,database:false,errorCode:e.code||'CONNECTION_FAILED'});
 }finally{if(pool)await pool.end().catch(()=>{});}
}
