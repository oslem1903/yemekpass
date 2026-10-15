import React from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
type Company={id:string;name:string};
type Entitlement={id:string;employee_id:string;category_id:string;granted:number;used:number;employee_name:string;category_name:string;company_name:string;valid_from:string;valid_until:string};
type LedgerMovement={id:string;agreement_id:string;entry_type:string;amount_kurus:string;created_at:string;company_name:string;restaurant_name:string};
type LedgerSummary={agreement_id:string;company_name:string;restaurant_name:string;payment_model:'prepaid'|'postpaid';advances_kurus:string;consumption_kurus:string;collections_kurus:string;reversals_kurus:string;allocations_kurus:string};
type CompanyReport={company_id:string;company_name:string;meal_count:number;total_kurus:string};
type Redemption={id:string;created_at:string;amount_kurus:number;employee_name:string;company_name:string;category_name:string;restaurant_name:string};
type Employee={id:string;name:string;company_id:string;company_name:string;active:boolean};
async function request<T>(path:string,method='GET',body?:object):Promise<T>{
 const r=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Sunucu hatası');return data as T;
}
function App(){
 const [authenticated,setAuthenticated]=React.useState<boolean|null>(null);
 const [adminPassword,setAdminPassword]=React.useState('');
 const [loginError,setLoginError]=React.useState('');
 const [tab,setTab]=React.useState('Genel Bakış');
 const [companies,setCompanies]=React.useState<Company[]>([]);
 const [employees,setEmployees]=React.useState<Employee[]>([]);
 const [entitlements,setEntitlements]=React.useState<Entitlement[]>([]);
 const [redemptions,setRedemptions]=React.useState<Redemption[]>([]);
 const [companyReports,setCompanyReports]=React.useState<CompanyReport[]>([]);
 const [ledgerSummaries,setLedgerSummaries]=React.useState<LedgerSummary[]>([]);
 const [ledgerMovements,setLedgerMovements]=React.useState<LedgerMovement[]>([]);
 const [movementAgreement,setMovementAgreement]=React.useState('');
 const [movementLimit,setMovementLimit]=React.useState(1000);
 const [paymentAgreement,setPaymentAgreement]=React.useState('');
 const [paymentAmount,setPaymentAmount]=React.useState('');
 const [paymentMessage,setPaymentMessage]=React.useState('');
 const pendingPayment=React.useRef<{key:string;agreement_id:string;entry_type:string;amount_kurus:number}|null>(null);
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
 const [testEntitlement,setTestEntitlement]=React.useState('');
 const [testResult,setTestResult]=React.useState('');
 const [online,setOnline]=React.useState(false);
 const refresh=React.useCallback(async()=>{try{
 const [c,e,rights,history,reports,ledger,movements]=await Promise.all([request<Company[]>('companies'),request<Employee[]>('employees'),request<Entitlement[]>('entitlements'),request<Redemption[]>('redemptions'),request<CompanyReport[]>('reports/company-consumption'),request<LedgerSummary[]>('ledger/summary'),request<{rows:LedgerMovement[];limit:number}>('ledger/movements')]);
 setCompanies(c);setEmployees(e);setEntitlements(rights);setRedemptions(history);setCompanyReports(reports);setLedgerSummaries(ledger);setLedgerMovements(movements.rows);setMovementLimit(movements.limit);setOnline(true);setError('');
 }catch(err){setOnline(false);setError((err as Error).message)}},[]);
 React.useEffect(()=>{void request<{authenticated:boolean}>('session').then(r=>setAuthenticated(r.authenticated)).catch(()=>setAuthenticated(false))},[]);
 React.useEffect(()=>{if(authenticated)void refresh()},[authenticated,refresh]);
 async function login(ev:React.FormEvent){ev.preventDefault();setLoginError('');try{await request('login','POST',{password:adminPassword});setAdminPassword('');setAuthenticated(true)}catch(e){setLoginError((e as Error).message)}}
 async function logout(){await request('logout','POST',{});setAuthenticated(false);setCompanies([]);setEmployees([]);setEntitlements([]);setLedgerSummaries([]);setLedgerMovements([]);setOnline(false)}
 if(authenticated===null)return <main><article><h2>YemekPASS</h2><p>Oturum kontrol ediliyor...</p></article></main>;
 if(!authenticated)return <main><article><h2>YemekPASS yönetici girişi</h2><p>Yerel yönetici parolanızı girin.</p><form onSubmit={login}><label>Parola <input type="password" required value={adminPassword} onChange={e=>setAdminPassword(e.target.value)} autoComplete="current-password"/></label> <button>Giriş yap</button></form>{loginError&&<p role="alert">{loginError}</p>}</article></main>;
 async function addCompany(ev:React.FormEvent){ev.preventDefault();setBusy(true);try{
 await request('companies','POST',{name});setName('');await refresh();
 }catch(err){setError((err as Error).message)}finally{setBusy(false)}}
 async function addEmployee(ev:React.FormEvent){ev.preventDefault();setBusy(true);try{
 await request('employees','POST',{name:employeeName,company_id:companyId});setEmployeeName('');await refresh();
 }catch(err){setError((err as Error).message)}finally{setBusy(false)}}
 async function addMeal(ev:React.FormEvent){ev.preventDefault();const person=employees.find(e=>e.id===mealEmployee);if(!person){setError('Personel seçin');return}setBusy(true);try{await request('meal-setup','POST',{company_id:person.company_id,employee_id:person.id,category_name:mealName,granted:mealCount,price_kurus:Math.round(mealPrice*100),payment_model:mealModel,valid_from:fromDate,valid_until:untilDate});await refresh()}catch(err){setError((err as Error).message)}finally{setBusy(false)}}
 async function addPayment(ev:React.FormEvent){ev.preventDefault();const agreement=ledgerSummaries.find(x=>x.agreement_id===paymentAgreement);if(!agreement){setError('Firma anlaşması seçin');return}
 const clean=paymentAmount.trim().replace(',','.');if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(clean)){setError('Geçerli TL tutarı girin (en fazla iki ondalık)');return}
 const [lira,kurus='']=clean.split('.');const amount=Number(lira)*100+Number(kurus.padEnd(2,'0'));if(!Number.isSafeInteger(amount)||amount<1){setError('Tutar sıfırdan büyük olmalı');return}
 const entry_type=agreement.payment_model==='prepaid'?'advance':'collection';
 const same=pendingPayment.current&&pendingPayment.current.agreement_id===paymentAgreement&&pendingPayment.current.entry_type===entry_type&&pendingPayment.current.amount_kurus===amount;
 const key=same?pendingPayment.current!.key:crypto.randomUUID();
 pendingPayment.current={key,agreement_id:paymentAgreement,entry_type,amount_kurus:amount};
 setBusy(true);setError('');setPaymentMessage('');
 try{const result=await request<{repeated:boolean}>('ledger/payments','POST',{agreement_id:paymentAgreement,entry_type,amount_kurus:amount,idempotency_key:key});
 pendingPayment.current=null;setPaymentAmount('');setPaymentMessage(result.repeated?'Önceden kaydedilen işlem doğrulandı.':'Ödeme kaydedildi.');await refresh()
 }catch(err){setError((err as Error).message)}finally{setBusy(false)}}
 const visibleMovements=ledgerMovements.filter(m=>!movementAgreement||m.agreement_id===movementAgreement);
 const movementNames:Record<string,string>={advance:'Avans',collection:'Tahsilat',consumption:'Yemek tüketimi',reversal:'İade / iptal',allocation:'Mahsup'};
 const money=(n:string)=>(Number(n)/100).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' TL';
 function exportCsv(){
  const rows=[['Tarih','Firma','Lokanta','İşlem','Tutar (TL)','İşlem ID'],...visibleMovements.map(m=>[new Date(m.created_at).toLocaleString('tr-TR'),m.company_name,m.restaurant_name,movementNames[m.entry_type]||m.entry_type,(Number(m.amount_kurus)/100).toFixed(2).replace('.',','),m.id])];
  const escapeCsv=(v:string)=>'"'+v.replace(/"/g,'""')+'"';
  const csv='\uFEFF'+rows.map(r=>r.map(escapeCsv).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const link=document.createElement('a');link.href=url;link.download='YemekPASS_Cari_Hareketler.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function testRedeem(){if(!testEntitlement){setError('Yemek hakkı seçin');return}setBusy(true);setError('');setTestResult('');try{const result=await request<{remaining:number;amount_kurus:number}>('local-test/redeem','POST',{entitlement_id:testEntitlement,idempotency_key:crypto.randomUUID()});setTestResult('Tüketim kaydedildi. Kalan: '+result.remaining+' | Tutar: '+(result.amount_kurus/100).toFixed(2)+' TL');await refresh()}catch(err){setError((err as Error).message)}finally{setBusy(false)}}
 return <div className="layout"><aside><h2>🍽 YemekPASS</h2><p>Lokanta yönetimi</p>{['Genel Bakış','Firmalar','Personeller','Yemek Hakları','QR İşlemleri','Cari Hesap','Raporlar'].map(t=><button className={tab===t?'active':''} onClick={()=>setTab(t)} key={t}>{t}</button>)}</aside><main>
 <header><span>{online?'Yerel veritabanı bağlı':'Veritabanı bağlantısı yok'}</span><strong>Lokanta Paneli <button onClick={()=>void logout()}>Çıkış</button></strong></header>
 <h1>{tab}</h1><p className="muted">Kurumsal yemek hakkı ve cari yönetimi</p>
 {error&&<article role="alert"><strong>Hata: {error}</strong><p>API ve Docker'ın çalıştığını kontrol edin.</p><button onClick={()=>void refresh()}>Tekrar dene</button></article>}
 {tab==='Genel Bakış'&&<><section className="stats">{[['Kayıtlı firma',companies.length],['Kayıtlı personel',employees.length],['Bugünkü öğün','Henüz aktif değil'],['Cari hesap','Henüz aktif değil']].map(([k,v])=><article key={k}><small>{k}</small><h2>{v}</h2></article>)}</section><h2>Firmalar</h2><CompanyTable companies={companies}/></>}
 {tab==='Firmalar'&&<><article><h2>Yeni firma ekle</h2><form onSubmit={addCompany}><label>Firma adı <input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="Örn. ABC İnşaat"/></label> <button disabled={busy||!online}>Firma kaydet</button></form></article><h2>Kayıtlı firmalar</h2><CompanyTable companies={companies}/></>}
 {tab==='Personeller'&&<><article><h2>Personel ekle</h2><form onSubmit={addEmployee}><label>Firma <select required value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">Firma seçin</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label> <label>Personel adı <input required minLength={2} maxLength={160} value={employeeName} onChange={e=>setEmployeeName(e.target.value)}/></label> <button disabled={busy||!online}>Personel kaydet</button></form></article><article><h2>Personel listesi</h2><table><thead><tr><th>Ad</th><th>Firma</th><th>Durum</th></tr></thead><tbody>{employees.map(e=><tr key={e.id}><td>{e.name}</td><td>{e.company_name}</td><td>{e.active?'Aktif':'Pasif'}</td></tr>)}</tbody></table>{employees.length===0&&<p>Henüz personel yok.</p>}</article></>}
 {tab==='Yemek Hakları'&&<><article><h2>Yemek hakkı tanımla</h2><form onSubmit={addMeal} className="meal-form"><label>Personel<select required value={mealEmployee} onChange={e=>setMealEmployee(e.target.value)}><option value="">Personel seç</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name} — {e.company_name}</option>)}</select></label><label>Yemek türü<input required value={mealName} onChange={e=>setMealName(e.target.value)} minLength={2}/></label><label>Adet<input type="number" required min={1} max={1000} value={mealCount} onChange={e=>setMealCount(Number(e.target.value))}/></label><label>Birim fiyat (TL)<input type="number" required min={0} step="0.01" value={mealPrice} onChange={e=>setMealPrice(Number(e.target.value))}/></label><label>Ödeme modeli<select value={mealModel} onChange={e=>setMealModel(e.target.value)}><option value="postpaid">Ay sonu</option><option value="prepaid">Ön ödemeli</option></select></label><label>Başlangıç<input type="date" required value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label><label>Bitiş<input type="date" required value={untilDate} onChange={e=>setUntilDate(e.target.value)}/></label><button disabled={!online||busy}>Yemek hakkını kaydet</button></form></article><article><h2>Tanımlı haklar</h2><table><thead><tr><th>Firma</th><th>Personel</th><th>Yemek</th><th>Verilen</th><th>Kullanılan</th><th>Kalan</th></tr></thead><tbody>{entitlements.map(e=><tr key={e.id}><td>{e.company_name}</td><td>{e.employee_name}</td><td>{e.category_name}</td><td>{e.granted}</td><td>{e.used}</td><td>{e.granted-e.used}</td></tr>)}</tbody></table>{entitlements.length===0&&<p>Henüz yemek hakkı tanımlanmadı.</p>}</article></>}
 {tab==='QR İşlemleri'&&<article><h2>Yerel tüketim testi</h2><p>Yalnızca yerel test içindir. QR okutma ve kullanıcı doğrulaması henüz uygulanmadı.</p><label>Yemek hakkı <select value={testEntitlement} onChange={e=>setTestEntitlement(e.target.value)}><option value="">Hak seçin</option>{entitlements.map(e=><option key={e.id} value={e.id}>{e.employee_name} — {e.category_name} — Kalan: {e.granted-e.used}</option>)}</select></label> <button disabled={!online||busy||!testEntitlement} onClick={()=>void testRedeem()}>Bir öğün tüket (TEST)</button>{testResult&&<p role="status">{testResult}</p>}</article>}{tab==='QR İşlemleri'&&<article><h2>Son tüketimler (en fazla 100)</h2><table><thead><tr><th>Tarih</th><th>Personel</th><th>Firma</th><th>Yemek</th><th>Tutar</th></tr></thead><tbody>{redemptions.map(r=><tr key={r.id}><td>{new Date(r.created_at).toLocaleString('tr-TR')}</td><td>{r.employee_name}</td><td>{r.company_name}</td><td>{r.category_name}</td><td>{(r.amount_kurus/100).toFixed(2)} TL</td></tr>)}</tbody></table>{redemptions.length===0&&<p>Henüz tüketim yok.</p>}</article>}
 {tab==='Raporlar'&&<article><h2>Firma bazında tüketim özeti</h2><p>İptal edilmemiş tüketim kayıtları üzerinden hesaplanır. Tahsilat ve avans bakiyesi değildir.</p><table><thead><tr><th>Firma</th><th>Tüketilen öğün</th><th>Toplam tutar</th></tr></thead><tbody>{companyReports.map(r=><tr key={r.company_id}><td>{r.company_name}</td><td>{r.meal_count}</td><td>{(Number(r.total_kurus)/100).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})} TL</td></tr>)}</tbody></table>{companyReports.length===0&&<p>Henüz firma kaydı yok.</p>}</article>}
 {tab==='Cari Hesap'&&<article><h2>Avans / tahsilat kaydet</h2><p>Ön ödemeli anlaşmada avans, ay sonu anlaşmasında tahsilat kaydedilir. İşlem kaydedildikten sonra bu ekrandan silinemez.</p><form onSubmit={addPayment}><label>Firma anlaşması <select required value={paymentAgreement} onChange={e=>{setPaymentAgreement(e.target.value);pendingPayment.current=null;setPaymentMessage('')}}><option value="">Anlaşma seçin</option>{ledgerSummaries.map(r=><option key={r.agreement_id} value={r.agreement_id}>{r.company_name} — {r.restaurant_name} ({r.payment_model==='prepaid'?'Avans':'Tahsilat'})</option>)}</select></label> <label>Tutar (TL) <input required inputMode="decimal" placeholder="Örn. 270,00" value={paymentAmount} onChange={e=>{setPaymentAmount(e.target.value);pendingPayment.current=null;setPaymentMessage('')}}/></label> <button disabled={busy||!online||!paymentAgreement}>Ödemeyi kaydet</button></form>{paymentMessage&&<p role="status">{paymentMessage}</p>}</article>}
 {tab==='Cari Hesap'&&<article><h2>Firma cari hareket özeti</h2><p>Bu ekran salt okunurdur. İade ve mahsup hareketleri varsa bakiye hesaplanmaz; mutabakat gerekir. Avans ve tahsilatlar yukarıdaki formdan kaydedilir.</p><table><thead><tr><th>Firma</th><th>Lokanta</th><th>Model</th><th>Avans</th><th>Tüketim</th><th>Tahsilat</th><th>İade / mahsup</th><th>Ön bakiye</th></tr></thead><tbody>{ledgerSummaries.map(r=>{const advance=BigInt(r.advances_kurus),consumed=BigInt(r.consumption_kurus),collected=BigInt(r.collections_kurus),reversed=BigInt(r.reversals_kurus),allocated=BigInt(r.allocations_kurus);const fmt=(n:bigint)=>(Number(n)/100).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' TL';return <tr key={r.agreement_id}><td>{r.company_name}</td><td>{r.restaurant_name}</td><td>{r.payment_model==='prepaid'?'Ön ödemeli':'Ay sonu'}</td><td>{fmt(advance)}</td><td>{fmt(consumed)}</td><td>{fmt(collected)}</td><td>{fmt(reversed+allocated)}</td><td>{reversed!==0n||allocated!==0n?'Mutabakat gerekli':fmt(r.payment_model==='prepaid'?advance-consumed:consumed-collected)}</td></tr>})}</tbody></table>{ledgerSummaries.length===0&&<p>Henüz firma anlaşması yok.</p>}</article>}
 {tab==='Cari Hesap'&&<article className="ledger-print"><h2>Cari hareket dökümü</h2><p>En yeni {movementLimit} hareketle sınırlıdır. CSV dosyası Excel'de açılır; PDF için Yazdır / PDF kaydet seçeneğini kullanın.</p><label>Firma anlaşması <select value={movementAgreement} onChange={e=>setMovementAgreement(e.target.value)}><option value="">Tüm anlaşmalar</option>{ledgerSummaries.map(r=><option key={r.agreement_id} value={r.agreement_id}>{r.company_name} — {r.restaurant_name}</option>)}</select></label> <button type="button" onClick={exportCsv} disabled={visibleMovements.length===0}>Excel için CSV indir</button> <button type="button" onClick={()=>window.print()}>Yazdır / PDF kaydet</button><table><thead><tr><th>Tarih</th><th>Firma</th><th>Lokanta</th><th>İşlem</th><th>Tutar</th></tr></thead><tbody>{visibleMovements.map(m=><tr key={m.id}><td>{new Date(m.created_at).toLocaleString('tr-TR')}</td><td>{m.company_name}</td><td>{m.restaurant_name}</td><td>{movementNames[m.entry_type]||m.entry_type}</td><td>{money(m.amount_kurus)}</td></tr>)}</tbody></table>{visibleMovements.length===0&&<p>Henüz cari hareket yok.</p>}</article>}
 </main></div>;
}
function CompanyTable({companies}:{companies:Company[]}){return <article><table><thead><tr><th>Firma adı</th><th>Kayıt</th></tr></thead><tbody>{companies.map(c=><tr key={c.id}><td>{c.name}</td><td>Kaydedildi</td></tr>)}</tbody></table>{companies.length===0&&<p>Henüz firma eklenmedi.</p>}</article>}
createRoot(document.getElementById('root')!).render(<App/>);
