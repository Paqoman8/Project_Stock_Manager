FROM node:20-alpine

WORKDIR /app

# Copier les manifestes en premier pour le cache Docker
COPY package*.json ./

RUN npm install

# Copier le code source
COPY . .

# Build Next.js (la variable BACKEND_URL n'est pas nécessaire au build,
# elle est lue au démarrage du serveur Next.js via next.config.ts)
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
