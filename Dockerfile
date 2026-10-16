# syntax=docker/dockerfile:1

FROM oven/bun:1.2-alpine AS builder
WORKDIR /app

# Accept build arguments for environment variables needed during Vite build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID
ENV NODE_ENV=production

# Install dependencies
COPY package.json bun.lock bunfig.toml* ./
RUN bun install --frozen-lockfile

# Copy source code and build
COPY . .
RUN bun run build

# Production image
FROM oven/bun:1.2-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80
ENV NITRO_PORT=80
ENV NITRO_HOST=0.0.0.0

# Copy all project files and built assets
COPY --from=builder /app ./

EXPOSE 80

# Start standalone Nitro SSR server on port 80
CMD ["bun", "run", ".output/server/index.mjs"]
