# CRM Deploy Hazir Paket

Bu klasor Hetzner gibi bir Linux sunucuda tek komutla ayağa kaldirilacak sekilde hazirlandi.

## Icinde ne var?

- Web
- API
- PostgreSQL
- Redis
- Caddy reverse proxy
- Otomatik veritabani migration
- Otomatik admin olusturma
- Otomatik pricing bootstrap

Not:
- Demo kullanici, demo task, demo isletme yoktur.
- Ilk kurulumda sadece gerekli pricing verileri olusturulur.

## Gerekenler

- Ubuntu/Debian tabanli bir sunucu
- Docker
- Docker Compose

## Kurulum

1. Bu klasore girin:

```bash
cd deployhazir
```

2. Bu klasorde hazir bir `.env` dosyasi vardir.

3. Sadece `.env` icini doldurun.

```env
DB_PASSWORD=guclu-bir-db-sifresi
CORS_ORIGINS=http://SUNUCU_IP
AUTH_SECRET=en-az-32-karakter-cok-guclu-bir-secret-degeri-yazin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=guclu-bir-admin-sifresi
```

Domain varsa `CORS_ORIGINS` icin domain kullanin:

```env
CORS_ORIGINS=https://crm.senin-domainin.com
```

4. Deploy komutunu calistirin:

```bash
bash deploy.sh
```

5. Sistem acildiktan sonra tarayicidan kontrol edin:

- `http://SUNUCU_IP`
- ya da domain kullandiysan kendi domainin

## Ne otomatik oluyor?

- PostgreSQL container baslar
- API container acilirken `prisma migrate deploy` calisir
- Admin kullanicisi yoksa olusturulur
- Pricing verileri bos ise otomatik yuklenir

## Ne otomatik gelmez?

- Demo account
- Demo task
- Demo manager/sales user
- Test verisi

## Sonraki guncellemeler

Bu klasorde yeni surumu cektikten sonra:

```bash
docker compose up -d --build
```

## Log kontrolu

```bash
docker compose logs -f
```
