import http from 'node:http';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const env=readFileSync(resolve(process.cwd(),'.env'),'utf8');
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
return send(res,404,{error:'Endpoint bulunamadı'});
}catch(e){if(e.code==='23503')return send(res,400,{error:'Firma bulunamadı'});if(e instanceof SyntaxError)return send(res,400,{error:'Geçersiz JSON'});console.error(e);return send(res,500,{error:'İşlem başarısız'})}
});
server.listen(4174,'127.0.0.1',()=>console.log('YemekPASS LOCAL API http://127.0.0.1:4174'));
