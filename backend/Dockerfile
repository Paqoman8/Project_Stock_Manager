FROM node:20-alpine

WORKDIR /app

# Copier les manifestes en premier — le layer npm install est mis en cache
# tant que package.json et le schéma Prisma ne changent pas
COPY package*.json ./
COPY prisma ./prisma/

RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm ci

# Copier le reste du code (src/, tsconfig.json, docker-entrypoint.sh, etc.)
COPY . .

# Générer le client Prisma puis compiler TypeScript → dist/
RUN npx prisma generate && npm run build

RUN chmod +x docker-entrypoint.sh

EXPOSE 5001

CMD ["./docker-entrypoint.sh"]
