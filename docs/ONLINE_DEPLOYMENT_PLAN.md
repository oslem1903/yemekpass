# YemekPASS — internet yayınına geçiş kontrolü

**Durum: YAYINA KAPALI.** Bu dal, çalışan yerel sürümün üzerine hazırlanmış geçiş planıdır. Bu değişiklik tek başına internet yayını veya personel giriş sistemi sağlamaz.

## Mevcut sunucuda doğrulanan engeller
- `api/server.mjs` PostgreSQL'e sabit `127.0.0.1:5439` adresinden bağlanıyor; bulut veritabanı bağlantısı yok.
- API yalnızca `127.0.0.1:4174` üzerinde dinliyor; Vercel'e tek başına yüklenemez.
- Yazma isteklerinin Origin izin listesi yalnızca `localhost:5173` ve `127.0.0.1:5173` adreslerini kabul ediyor.
- Yönetici oturumları bellekte tutuluyor; sunucu yeniden başlatıldığında oturumlar kayboluyor.
- Yönetici çerezi `HttpOnly; SameSite=Strict` ama HTTPS ortamı için `Secure` bayrağı eklenmeli.
- QR imza anahtarı her sunucu başlangıcında rastgele üretiliyor; birden çok sunucu arasında imzalar doğrulanamaz.
- `/api/qr/token` ve `/api/qr/redeem` yalnızca yönetici oturumuna açık. Personel ve lokanta rolleri henüz yok.
- Kamera bileşeni tarayıcının `BarcodeDetector` desteğine bağlı; tüm telefonlarda çalışacağı garanti değil.

## Güvenli uygulama sırası
1. Ayrı **staging** ortamı ve veritabanı kur; mevcut yerel PostgreSQL verisini değiştirme.
2. Bulut PostgreSQL'e TLS bağlantısı, yalnızca sunucuda tutulan ortam değişkenleri ve migration sistemi ekle. Gerçek verileri taşımadan önce şifreli yedek ve geri yükleme testi yap.
3. API'yi kalıcı bir Node.js sunucusunda HTTPS reverse proxy arkasında çalıştır; frontend'i HTTPS altında yayınla. Origin, proxy, oturum çerezi ve rate-limit ayarlarını yapılandır.
4. Kullanıcı kimlikleri ve rol bazlı yetkilendirme ekle: `admin`, `restaurant_operator`, `employee`. Personel yalnızca kendi hakkını ve kodunu görebilmeli; lokanta yetkilisi yalnızca kendisine atanmış lokantaya tüketim kaydedebilmeli.
5. QR oluşturmayı kimliği doğrulanmış personele, okutmayı yetkili lokantaya bağla. Kısa ömürlü imza, tek kullanımlık nonce, idempotency, tarih/hak/bakiye kontrolü ve cari kayıtlarını tek veritabanı işlemiyle koru.
6. Kamera için Android Chrome ve iPhone Safari üzerinde HTTPS cihaz testleri yap; desteklenmeyen tarayıcı için güvenilir QR kütüphanesi veya manuel kod yedeği ekle.
7. Test firması/personeliyle: yetkisiz erişim, farklı firma, farklı lokanta, tekrar okutma, süresi dolmuş kod, eşzamanlı iki okutma, yetersiz bakiye ve başarısız ağ isteğini doğrula.
8. Ancak güvenlik ve muhasebe mutabakatı geçtikten sonra üretime aç.

## Yayınlama sırasında yapılmaması gerekenler
- `.env`, parola, oturum çerezi veya QR imza anahtarını GitHub'a yükleme.
- Yerel PostgreSQL portunu doğrudan internete açma.
- Yönetici parolasını tüm personel ve lokantalarla paylaşma.
- Vercel frontend yayınını tamamlanmış canlı YemekPASS olarak sunma.

## Karar verilmesi gereken altyapı
- Frontend: Vercel kullanılabilir.
- Backend: kalıcı Node.js + HTTPS destekli barındırma (ör. Render/Railway/VPS).
- Database: yönetilen PostgreSQL; uygulama ve veritabanı için aynı/uygun bölge seçilmeli.
- Alan adı ve gerçek kullanıcı kayıt yöntemi henüz seçilmedi.

**Not:** Bu belge hazırlık aşamasıdır; yayın, veri aktarımı ve gerçek kullanıcı hesabı oluşturma işlemi yapılmadı.
