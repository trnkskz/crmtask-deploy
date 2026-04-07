#!/usr/bin/env bash
set -e

if [ ! -f ".env" ]; then
  echo ".env dosyasi bulunamadi."
  echo ".env.example dosyasini .env olarak kopyalayip degerleri doldurun."
  exit 1
fi

required_vars=("DB_PASSWORD" "CORS_ORIGINS" "AUTH_SECRET" "ADMIN_EMAIL" "ADMIN_PASSWORD")

for var_name in "${required_vars[@]}"; do
  if ! grep -Eq "^${var_name}=.+" ".env"; then
    echo "Eksik ortam degiskeni: ${var_name}"
    exit 1
  fi
done

echo "Deploy basliyor..."
docker compose up -d --build

echo ""
echo "Servisler baslatildi. Durumu kontrol etmek icin:"
echo "docker compose ps"
echo ""
echo "Canli loglar icin:"
echo "docker compose logs -f"
