FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# BACKEND_URL doit être connu au moment du build car Next.js sérialise les rewrites
# dans .next/routes-manifest.json pendant "next build".
# La valeur runtime (docker-compose environment) arrive trop tard.
ARG BACKEND_URL=http://localhost:5001
ENV BACKEND_URL=$BACKEND_URL

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
