import React from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
type Company={id:string;name:string};
type Employee={id:string;name:string;company_id:string;company_name:string;active:boolean};
async function request<T>(path:string,method='GET',body?:object):Promise<T>{
 const r=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Sunucu hatası');return data as T;
}
function App(){
 const [tab,setTab]=React.useState('Genel Bakış');
 const [companies,setCompanies]=React.useState<Company[]>([]);
 const [employees,setEmployees]=React.useState<Employee[]>([]);
 const [name,setName]=React.useState('');
 const [employeeName,setEmployeeName]=React.useState('');
 const [companyId,setCompanyId]=React.useState('');
 const [error,setError]=React.useState('');
 const [busy,setBusy]=React.useState(false);
 const [online,setOnline]=React.useState(false);
 const refresh=React.useCallback(async()=>{try{
 const [c,e]=await Promise.all([request<Company[]>('companies'),request<Employee[]>('employees')]);
 setCompanies(c);setEmployees(e);setOnline(true);setError('');
 }catch(err){setOnline(false);setError((err as Error).message)}},[]);
 React.useEffect(()=>{void refresh()},[refresh]);
 async function addCompany(ev:React.FormEvent){ev.preventDefault();setBusy(true);try{
 await request('companies','POST',{name});setName('');await refresh();
 }catch(err){setError((err as Error).message)}finally{setBusy(false)}}
 async function addEmployee(ev:React.FormEvent){ev.preventDefault();setBusy(true);try{
 await request('employees','POST',{name:employeeName,company_id:companyId});setEmployeeName('');await refresh();
 }catch(err){setError((err as Error).message)}finally{setBusy(false)}}
 return <div className="layout"><aside><h2>🍽 YemekPASS</h2><p>Lokanta yönetimi</p>{['Genel Bakış','Firmalar','Personeller','QR İşlemleri','Cari Hesap','Raporlar'].map(t=><button className={tab===t?'active':''} onClick={()=>setTab(t)} key={t}>{t}</button>)}</aside><main>
 <header><span>{online?'Yerel veritabanı bağlı':'Veritabanı bağlantısı yok'}</span><strong>Lokanta Paneli</strong></header>
 <h1>{tab}</h1><p className="muted">Kurumsal yemek hakkı ve cari yönetimi</p>
 {error&&<article role="alert"><strong>Hata: {error}</strong><p>API ve Docker'ın çalıştığını kontrol edin.</p><button onClick={()=>void refresh()}>Tekrar dene</button></article>}
 {tab==='Genel Bakış'&&<><section className="stats">{[['Kayıtlı firma',companies.length],['Kayıtlı personel',employees.length],['Bugünkü öğün','Henüz aktif değil'],['Cari hesap','Henüz aktif değil']].map(([k,v])=><article key={k}><small>{k}</small><h2>{v}</h2></article>)}</section><h2>Firmalar</h2><CompanyTable companies={companies}/></>}
 {tab==='Firmalar'&&<><article><h2>Yeni firma ekle</h2><form onSubmit={addCompany}><label>Firma adı <input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="Örn. ABC İnşaat"/></label> <button disabled={busy||!online}>Firma kaydet</button></form></article><h2>Kayıtlı firmalar</h2><CompanyTable companies={companies}/></>}
 {tab==='Personeller'&&<><article><h2>Personel ekle</h2><form onSubmit={addEmployee}><label>Firma <select required value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">Firma seçin</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label> <label>Personel adı <input required minLength={2} maxLength={160} value={employeeName} onChange={e=>setEmployeeName(e.target.value)}/></label> <button disabled={busy||!online}>Personel kaydet</button></form></article><article><h2>Personel listesi</h2><table><thead><tr><th>Ad</th><th>Firma</th><th>Durum</th></tr></thead><tbody>{employees.map(e=><tr key={e.id}><td>{e.name}</td><td>{e.company_name}</td><td>{e.active?'Aktif':'Pasif'}</td></tr>)}</tbody></table>{employees.length===0&&<p>Henüz personel yok.</p>}</article></>}
 {['QR İşlemleri','Cari Hesap','Raporlar'].includes(tab)&&<article><h2>{tab}</h2><p>Bu modül henüz aktif değil. QR ve finansal işlemler gerçek veri üzerinde güvenli sunucu akışı tamamlanınca açılacak.</p></article>}
 </main></div>;
}
function CompanyTable({companies}:{companies:Company[]}){return <article><table><thead><tr><th>Firma adı</th><th>Kayıt</th></tr></thead><tbody>{companies.map(c=><tr key={c.id}><td>{c.name}</td><td>Kaydedildi</td></tr>)}</tbody></table>{companies.length===0&&<p>Henüz firma eklenmedi.</p>}</article>}
createRoot(document.getElementById('root')!).render(<App/>);
