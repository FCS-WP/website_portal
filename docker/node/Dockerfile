FROM node:20-alpine

WORKDIR /var/www/frontend

# Install dependencies only when needed
COPY portal/frontend/package*.json ./
RUN npm install

COPY portal/frontend/ .

EXPOSE 3000

CMD ["npm", "run", "dev"]
