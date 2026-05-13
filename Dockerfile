FROM node:20-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-venv sqlite3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json requirements.txt ./
RUN npm install

COPY . .

RUN python3 -m venv .venv \
  && ./.venv/bin/pip install -r requirements.txt \
  && npm run import-data \
  && npm run build

ENV NODE_ENV=production
EXPOSE 10000

CMD ["npm", "run", "start"]
