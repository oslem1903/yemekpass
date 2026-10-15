import React from 'react';

type ScannerProps={disabled:boolean;onRedeem:(token:string)=>Promise<void>};
type Detector={detect:(source:HTMLVideoElement)=>Promise<Array<{rawValue:string}>>};
type DetectorConstructor=new(options:{formats:string[]})=>Detector;

export default function QrCameraScanner({disabled,onRedeem}:ScannerProps){
 const videoRef=React.useRef<HTMLVideoElement|null>(null);
 const streamRef=React.useRef<MediaStream|null>(null);
 const detectorRef=React.useRef<Detector|null>(null);
 const scanningRef=React.useRef(false);
 const [active,setActive]=React.useState(false);
 const [token,setToken]=React.useState('');
 const [message,setMessage]=React.useState('');
 const [working,setWorking]=React.useState(false);
 const stop=React.useCallback(()=>{
  scanningRef.current=false;
  streamRef.current?.getTracks().forEach(track=>track.stop());
  streamRef.current=null;
  if(videoRef.current){videoRef.current.pause();videoRef.current.srcObject=null;}
  setActive(false);
 },[]);
 React.useEffect(()=>()=>stop(),[stop]);
 const submit=async(value:string)=>{
  if(!value.trim()||working||disabled)return;
  setWorking(true);stop();setMessage('');
  try{await onRedeem(value.trim());setToken('');setMessage('Kod sunucuya gönderildi. İşlem sonucunu yukarıda kontrol edin.')}
  catch(e){setMessage((e as Error).message)}
  finally{setWorking(false)}
 };
 const start=async()=>{
  setMessage('');
  if(!navigator.mediaDevices?.getUserMedia){setMessage('Kamera erişimi yok. localhost veya HTTPS üzerinden açın.');return}
  const Ctor=(window as Window & {BarcodeDetector?:DetectorConstructor}).BarcodeDetector;
  if(!Ctor){setMessage('Bu tarayıcı QR kamera taramasını desteklemiyor. Kodu elle yapıştırabilirsiniz.');return}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
   streamRef.current=stream;
   detectorRef.current=new Ctor({formats:['qr_code']});
   const video=videoRef.current;
   if(!video){stop();return}
   video.srcObject=stream;await video.play();
   scanningRef.current=true;setActive(true);
   const scan=async()=>{
    if(!scanningRef.current)return;
    try{
     if(video.readyState>=2){
      const matches=await detectorRef.current!.detect(video);
      if(matches.length&&matches[0].rawValue){
       const value=matches[0].rawValue;
       stop();setToken(value);setMessage('QR okundu. Tüketimi onaylamak için düğmeye basın.');return;
      }
     }
    }catch{setMessage('QR okunamadı. Kodu elle girebilir veya kamerayı yeniden açabilirsiniz.');stop();return}
    if(scanningRef.current)requestAnimationFrame(()=>{void scan()});
   };
   void scan();
  }catch{stop();setMessage('Kamera açılamadı. Tarayıcı kamera iznini kontrol edin.')}
 };
 return <section aria-label="QR kamera okutma">
  <h3>Kamerayla QR okut</h3>
  <p>Bu ekran yerel yönetici testidir. Kameranın çalışması tarayıcı desteğine bağlıdır. Okutma tek başına tüketim yapmaz; ayrıca onay gerekir.</p>
  <video ref={videoRef} muted playsInline style={{display:active?'block':'none',width:'100%',maxWidth:420,borderRadius:8}}/>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   <button type="button" onClick={()=>void start()} disabled={disabled||working||active}>Kamerayı aç</button>
   {active&&<button type="button" onClick={stop}>Kamerayı kapat</button>}
  </div>
  <label style={{display:'block',marginTop:12}}>İmzalı QR kodu
   <textarea value={token} onChange={e=>setToken(e.target.value)} rows={3} style={{display:'block',width:'100%',maxWidth:550,boxSizing:'border-box'}} placeholder="Kamera ile okutun veya kodu buraya yapıştırın"/>
  </label>
  <button type="button" disabled={disabled||working||!token.trim()} onClick={()=>void submit(token)}>Tüketimi onayla</button>
  {message&&<p role="status">{message}</p>}
 </section>;
}
