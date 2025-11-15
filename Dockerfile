FROM node:20

WORKDIR /app
ENV PORT=3000

COPY package.json .
COPY server.js .
COPY igClient.js .
COPY .dockerignore .

RUN npm install --omit=dev

EXPOSE 3000

CMD ["node", "server.js"]
