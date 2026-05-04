#!/bin/sh
set -e

echo "⏳  Application des migrations Prisma..."
until npx prisma migrate deploy; do
  echo "   Migration échouée, nouvelle tentative dans 5s..."
  sleep 5
done
echo "✅  Migrations appliquées."

echo "🌱  Initialisation des données (seed)..."
npx prisma db seed && echo "✅  Seed terminé." || echo "⚠️   Seed ignoré (données déjà présentes ou erreur non bloquante)."

echo "🚀  Démarrage du serveur Stock Manager..."
exec node dist/server.js
