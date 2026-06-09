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

# APP_NAME est baked dans le bundle Next.js via NEXT_PUBLIC_* au moment du build.
ARG APP_NAME=Stock Manager
ENV NEXT_PUBLIC_APP_NAME=$APP_NAME

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
