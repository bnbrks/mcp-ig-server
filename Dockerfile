FROM node:20

WORKDIR /app

COPY package.json .
COPY server.js .
COPY .dockerignore .

RUN npm install --omit=dev

EXPOSE 3000

CMD ["node", "server.js"]
