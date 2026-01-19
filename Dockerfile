# Stage 1: Build Java/TeaVM component
FROM eclipse-temurin:21-jdk AS java-builder

WORKDIR /app/java
COPY java/ .
RUN chmod +x ./gradlew && ./gradlew build --no-daemon

# Stage 2: Build Node.js frontend
FROM node:22-alpine AS node-builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy Java build artifacts
COPY --from=java-builder /app/java/build/generated ./java/build/generated

# Copy source and build
COPY . .
RUN npm run build

# Stage 3: Production server with nginx
FROM nginx:alpine

# Copy built assets
COPY --from=node-builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
