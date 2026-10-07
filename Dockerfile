FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src ./src
COPY db ./db
RUN npm run build
EXPOSE 8787
CMD ["node","dist/runtime/serve.js"]
