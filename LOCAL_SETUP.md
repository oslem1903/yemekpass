# YemekPASS — Yerel geliştirme

## Gerekenler
- Node.js 20+ ve npm
- Docker Desktop (Windows'ta WSL2 ile)
- Git

## Kurulum
1. Depoyu bilgisayara klonlayın.
2. `.env.example` dosyasını `.env` olarak kopyalayın ve uzun, rastgele bir POSTGRES_PASSWORD belirleyin.
3. `docker compose up -d` komutunu çalıştırın.
4. `docker compose ps` ile db servisinin healthy olduğunu doğrulayın.
5. `npm install` ardından `npm run dev` komutunu çalıştırın.
6. Tarayıcıdan Vite'ın gösterdiği yerel adresi açın.

## Önemli sınırlar
- Mevcut ekran **örnek verili demo**dur; henüz PostgreSQL'e bağlanmaz.
- PostgreSQL'e tarayıcıdan doğrudan erişim verilmez. Sonraki adım kimlik doğrulamalı sunucu API'si ve atomik QR tüketim fonksiyonudur.
- Yerel veritabanı yalnızca 127.0.0.1:5439 üzerinden erişilebilir.
- `local-db/001_schema.sql` sadece **ilk boş veritabanı oluşturulurken** çalışır; şema değişiklikleri için ayrıca migration gerekir.
- `supabase/migrations` ileride Supabase'e geçiş için ayrı taslaktır, yerel şemayla birebir aynı değildir; otomatik birlikte uygulanmamalıdır.
- Docker volume silme komutları gerçek veriyi silebilir. Geliştirme sırasında bile yedek almadan silmeyin.
- Şifreleri GitHub'a veya sohbet ekranına göndermeyin.
