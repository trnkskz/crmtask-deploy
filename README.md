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

## Gerekenler

- Ubuntu/Debian tabanli bir sunucu
- Docker
- Docker Compose

## Kurulum

1. Repo'yu sunucuya alin ve klasore girin:

```bash
git clone git@github.com:trnkskz/crmtask-deploy.git
cd crmtask-deploy
```

2. Bu klasorde hazir bir `.env` dosyasi vardir.

3. Sadece `.env` icini doldurun.

```env
DB_PASSWORD=crmDB_7Kx!29Lm#Qp4Vz8Rt1Ns6Wd
CORS_ORIGINS=http://SUNUCU_IP
AUTH_SECRET=crmAuth_9Qx!4Lm#Tz7Vp2Ns8Kd1Rw6Hy3Cb5Mf
ADMIN_EMAIL=turankusaksiz@gmail.com
ADMIN_PASSWORD=TuranAdmin!2026#Safe91
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

## Sonraki guncellemeler

Bu klasorde yeni surumu cektikten sonra:

```bash
docker compose up -d --build
```

## Log kontrolu

```bash
docker compose logs -f
```
