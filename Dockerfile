FROM node:20-bookworm
LABEL maintainer="Aidan Noll (aidan.noll@carvesystems.com)"

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python-is-python3 sqlite3 build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m app
USER app

COPY --chown=app . /home/app/app

RUN cd /home/app/app && npm install && npm run tsc && npm run sequelize db:migrate && npm run sequelize db:seed:all

EXPOSE 3000/tcp

CMD cd /home/app/app && node build/01-test-target-graphql-server/01-server/app.js
