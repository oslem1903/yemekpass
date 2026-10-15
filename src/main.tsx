import React from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
type Company={id:string;name:string};
type Entitlement={id:string;employee_id:string;category_id:string;granted:number;used:number;employee_name:string;category_name:string;company_name:string;valid_from:string;valid_until:string};
type Employee={id:string;name:string;company_id:string;company_name:string;active:boolean};
async function request<T>(path:string,method='GET',body?:object):Promise<T>{
 const r=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Sunucu hatası');return data as T;
}
function App(){
 const [tab,setTab]=React.useState('Genel Bakış');
 const [companies,setCompanies]=React.useState<Company[]>([]);
 const [employees,setEmployees]=React.useState<Employee[]>([]);
 const [entitlements,setEntitlements]=React.useState<Entitlement[]>([]);
 const [mealEmployee,setMealEmployee]=React.useState('');
 const [mealName,setMealName]=React.useState('Tavuk + Sebze');
 const [mealCount,setMealCount]=React.useState(3);
 const [mealPrice,setMealPrice]=React.useState(150);
 const [mealModel,setMealModel]=React.useState('postpaid');
 const [fromDate,setFromDate]=React.useState(new Date().toISOString().slice(0,10));
 const [untilDate,setUntilDate]=React.useState(new Date(Date.now()+30*86400000).toISOString().slice(0,10));
 const [name,setName]=React.useState('');
 const [employeeName,setEmployeeName]=React.useState('');
 const [companyId,setCompanyId]=React.useState('');
 const [error,setError]=React.useState('');
 const [busy,setBusy]=React.useState(false);
 const [online,setOnline]=React.useState(false);
 const refresh=React.useCallback(async()=>{try{
 const [c,e,rights]=await Promise.all([request<Company[]>('companies'),request<Employee[]>('employees'),request<Entitlement[]>('entitlements')]);
 setCompanies(c);setEmployees(e);setEntitlements(rights);setOnline(true);setError('');
 }catch(err){setOnline(false);setError((err as Error).message)}},[]);
 React.useEffect(()=>{void refresh()},[refresh]);
 async function addCompany(ev:React.FormEvent){ev.preventDefault();setBusy(true);try{
 await request('companies','POST',{name});setName('');await refresh();
 }catch(err){setError((err as Error).message)}finally{setBusy(false)}}
 async function addEmployee(ev:React.FormEvent){ev.preventDefault();setBusy(true);try{
 await request('employees','POST',{name:employeeName,company_id:companyId});setEmployeeName('');await refresh();
 }catch(err){setError((err as Error).message)}finally{setBusy(false)}}
 async function addMeal(ev:React.FormEvent){ev.preventDefault();const person=employees.find(e=>e.id===mealEmployee);if(!person){setError('Personel seçin');return}setBusy(true);try{await request('meal-setup','POST',{company_id:person.company_id,employee_id:person.id,category_name:mealName,granted:mealCount,price_kurus:Math.round(mealPrice*100),payment_model:mealModel,valid_from:fromDate,valid_until:untilDate});await refresh()}catch(err){setError((err as Error).message)}finally{setBusy(false)}}
 return <div className="layout"><aside><h2>🍽 YemekPASS</h2><p>Lokanta yönetimi</p>{['Genel Bakış','Firmalar','Personeller','Yemek Hakları','QR İşlemleri','Cari Hesap','Raporlar'].map(t=><button className={tab===t?'active':''} onClick={()=>setTab(t)} key={t}>{t}</button>)}</aside><main>
 <header><span>{online?'Yerel veritabanı bağlı':'Veritabanı bağlantısı yok'}</span><strong>Lokanta Paneli</strong></header>
 <h1>{tab}</h1><p className="muted">Kurumsal yemek hakkı ve cari yönetimi</p>
 {error&&<article role="alert"><strong>Hata: {error}</strong><p>API ve Docker'ın çalıştığını kontrol edin.</p><button onClick={()=>void refresh()}>Tekrar dene</button></article>}
 {tab==='Genel Bakış'&&<><section className="stats">{[['Kayıtlı firma',companies.length],['Kayıtlı personel',employees.length],['Bugünkü öğün','Henüz aktif değil'],['Cari hesap','Henüz aktif değil']].map(([k,v])=><article key={k}><small>{k}</small><h2>{v}</h2></article>)}</section><h2>Firmalar</h2><CompanyTable companies={companies}/></>}
 {tab==='Firmalar'&&<><article><h2>Yeni firma ekle</h2><form onSubmit={addCompany}><label>Firma adı <input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="Örn. ABC İnşaat"/></label> <button disabled={busy||!online}>Firma kaydet</button></form></article><h2>Kayıtlı firmalar</h2><CompanyTable companies={companies}/></>}
 {tab==='Personeller'&&<><article><h2>Personel ekle</h2><form onSubmit={addEmployee}><label>Firma <select required value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">Firma seçin</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label> <label>Personel adı <input required minLength={2} maxLength={160} value={employeeName} onChange={e=>setEmployeeName(e.target.value)}/></label> <button disabled={busy||!online}>Personel kaydet</button></form></article><article><h2>Personel listesi</h2><table><thead><tr><th>Ad</th><th>Firma</th><th>Durum</th></tr></thead><tbody>{employees.map(e=><tr key={e.id}><td>{e.name}</td><td>{e.company_name}</td><td>{e.active?'Aktif':'Pasif'}</td></tr>)}</tbody></table>{employees.length===0&&<p>Henüz personel yok.</p>}</article></>}
 {tab==='Yemek Hakları'&&<><article><h2>Yemek hakkı tanımla</h2><form onSubmit={addMeal} className="meal-form"><label>Personel<select required value={mealEmployee} onChange={e=>setMealEmployee(e.target.value)}><option value="">Personel seç</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name} — {e.company_name}</option>)}</select></label><label>Yemek türü<input required value={mealName} onChange={e=>setMealName(e.target.value)} minLength={2}/></label><label>Adet<input type="number" required min={1} max={1000} value={mealCount} onChange={e=>setMealCount(Number(e.target.value))}/></label><label>Birim fiyat (TL)<input type="number" required min={0} step="0.01" value={mealPrice} onChange={e=>setMealPrice(Number(e.target.value))}/></label><label>Ödeme modeli<select value={mealModel} onChange={e=>setMealModel(e.target.value)}><option value="postpaid">Ay sonu</option><option value="prepaid">Ön ödemeli</option></select></label><label>Başlangıç<input type="date" required value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label><label>Bitiş<input type="date" required value={untilDate} onChange={e=>setUntilDate(e.target.value)}/></label><button disabled={!online||busy}>Yemek hakkını kaydet</button></form></article><article><h2>Tanımlı haklar</h2><table><thead><tr><th>Firma</th><th>Personel</th><th>Yemek</th><th>Verilen</th><th>Kullanılan</th><th>Kalan</th></tr></thead><tbody>{entitlements.map(e=><tr key={e.id}><td>{e.company_name}</td><td>{e.employee_name}</td><td>{e.category_name}</td><td>{e.granted}</td><td>{e.used}</td><td>{e.granted-e.used}</td></tr>)}</tbody></table>{entitlements.length===0&&<p>Henüz yemek hakkı tanımlanmadı.</p>}</article></>}
 {['QR İşlemleri','Cari Hesap','Raporlar'].includes(tab)&&<article><h2>{tab}</h2><p>Bu modül henüz aktif değil. QR ve finansal işlemler gerçek veri üzerinde güvenli sunucu akışı tamamlanınca açılacak.</p></article>}
 </main></div>;
}
function CompanyTable({companies}:{companies:Company[]}){return <article><table><thead><tr><th>Firma adı</th><th>Kayıt</th></tr></thead><tbody>{companies.map(c=><tr key={c.id}><td>{c.name}</td><td>Kaydedildi</td></tr>)}</tbody></table>{companies.length===0&&<p>Henüz firma eklenmedi.</p>}</article>}
createRoot(document.getElementById('root')!).render(<App/>);
