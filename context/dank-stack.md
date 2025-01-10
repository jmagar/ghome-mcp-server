Model Context Protocol AI Chatbot:

# Project Structure

## Progress Legend
🟢 - Exists and configured
🟡 - Partially exists/needs configuration
🔴 - Needs to be created

## Core Structure
- Monorepo
  - `/apps/*` - Application packages 🟢
  - `/packages/*` - Shared packages 🟢
  - `pnpm-workspace.yaml` - Workspace configuration 🟢
  - `turbo.json` - Turborepo configuration 🟢
  - `docker-compose.yml` - Database services configuration 🔴

## Applications
- Next.js App Router
  - `/apps/web/` - Main web application 🟡
    - `/apps/web/app/*` - Next.js app router pages 🔴
      - `/apps/web/app/(auth)/*` - Auth-related pages 🔴
      - `/apps/web/app/(chat)/*` - Chat-related pages 🔴
      - `/apps/web/app/api/chat/*` - Chat API endpoints 🔴
    - `/apps/web/public/*` - Static assets 🟢
    - `/apps/web/next.config.js` - Next.js configuration 🟢
    - `/apps/web/lib/` - Application utilities 🔴
      - `/apps/web/lib/utils/` - Shared utilities 🔴
      - `/apps/web/lib/constants/` - Shared constants 🔴
      - `/apps/web/lib/hooks/` - Shared hooks 🔴
      - `/apps/web/lib/config/` - App-specific configurations 🔴
      - `/apps/web/lib/middleware/` - Next.js middleware 🔴
      - `/apps/web/lib/providers/` - React context providers 🔴
  - `/apps/docs/` - Documentation site 🟡

## Core Technologies
- Typescript w/ React
  - `/packages/tsconfig/` - Shared TypeScript configurations 🟢
    - `/packages/tsconfig/base.json` - Base TS config 🟢
    - `/packages/tsconfig/nextjs.json` - Next.js specific TS config 🟢
  - `/packages/types/` - Shared TypeScript types 🔴
    - `/packages/types/src/index.ts` - Type exports 🔴
    - `/packages/types/src/api/` - API types 🔴
    - `/packages/types/src/db/` - Database types 🔴
  - `tsconfig.json` - Root TypeScript config 🔴

## Package Management
- pnpm
  - `pnpm-workspace.yaml` - Workspace definition 🟢
  - `pnpm-lock.yaml` - Lock file 🟢
  - `.npmrc` - NPM configuration 🟢

## AI/ML Integration
- langchain
  - `/apps/bot/mcp/` - MCP bot implementation 🟢
    - `/apps/bot/mcp/src/servers/` - MCP server implementations 🟢
    - `/apps/bot/mcp/src/index.ts` - Main bot entry point 🟢
  - `mcp-config.json5` - MCP configuration (root level for easy access) 🟢

## API & Validation
- Next.js Server Actions
  - `/apps/web/app/api/actions/*` - Server action implementations 🔴
  - `/apps/web/app/api/routes/*` - API route handlers 🔴

- Zod for validation
  - `/packages/schema/` - Shared schema definitions 🔴
    - `/packages/schema/src/` - Schema source files 🟢
    - `/packages/schema/index.ts` - Schema exports 🟢
  - `/apps/web/lib/validations/*` - Application-specific schemas 🟢

## AI Provider Support
- OpenAI, Anthropic, and OpenRouter support
  - `.env` - API keys and configuration 🟢
  - `/apps/web/lib/ai/providers/*` - Provider implementations 🔴
  - `/apps/web/lib/ai/config.ts` - AI configuration 🔴

## Environment & Configuration
- Dotenv for environment management
  - `.env` - Environment variables 🟢
  - `.env.example` - Example environment template 🔴
  - `/apps/*/env.ts` - App-specific environment validation 🔴

## Build & Development
- Turbopack
  - `/apps/web/next.config.js` - Turbopack configuration 🔴
  - `turbo.json` - Turborepo pipeline configuration 🟢

## Code Quality
- eslint+prettier
  - `/packages/eslint/` - Shared ESLint configurations 🟢
  - `.eslintrc.js` - Root ESLint config 🔴
  - `.prettierrc.js` - Prettier configuration 🔴
  - `.editorconfig` - Editor configuration 🔴

## Logging & Monitoring
- Pino for global logging
  - `/packages/logger/` - Shared logging package 🔴
    - `/packages/logger/src/index.ts` - Logger implementation 🔴
    - `/packages/logger/src/formatters/` - Custom formatters 🔴
  - `/apps/*/lib/logger.ts` - App-specific logger instances 🔴

## Caching & Real-time
- Redis for caching
  - `/packages/redis/` - Shared Redis utilities 🔴
    - `/packages/redis/src/client.ts` - Redis client implementation 🔴
    - `/packages/redis/src/pubsub.ts` - PubSub implementation 🔴
    - `/packages/redis/src/connection.ts` - IORedis connection pooling 🔴
  - `/apps/web/lib/redis/*` - Web app Redis implementations 🔴

## Database
- Postgres & Drizzle ORM
  - `/packages/db/` - Shared database package 🔴
    - `/packages/db/src/client.ts` - Database client 🔴
    - `/packages/db/src/schema/` - Database schema definitions 🔴
    - `/packages/db/src/migrations/` - Database migrations 🔴
    - `/packages/db/src/types/` - Database types 🔴
    - `/packages/db/src/seeds/` - Database seeds 🔴
    - `/packages/db/src/connection.ts` - PgBouncer configuration 🔴
  - `drizzle.config.ts` - Drizzle configuration 🔴

## Vector Search
- Qdrant for vector search
  - `/packages/qdrant/` - Shared Qdrant utilities 🔴
    - `/packages/qdrant/src/client.ts` - Qdrant client 🔴
    - `/packages/qdrant/src/types.ts` - Type definitions 🔴
  - `/apps/web/lib/qdrant/*` - Web app Qdrant implementations 🔴

## UI Components
- Shadcn/UI for component library
  - `/packages/ui/` - Shared UI components 🟢
    - `/packages/ui/src/components/*` - Component implementations 🔴
    - `/packages/ui/src/styles/*` - Shared styles 🔴
    - `/packages/ui/src/types/*` - Component types 🔴
    - `/packages/ui/src/utils/*` - Component utilities 🔴
  - `/apps/web/components/*` - App-specific components 🔴

## Real-time Communication
- Websockets via next.js
  - `/apps/web/app/api/socket/*` - WebSocket route handlers 🔴
  - `/apps/web/lib/socket/*` - WebSocket utilities 🔴
    - `/apps/web/lib/socket/client.ts` - WebSocket client 🔴
    - `/apps/web/lib/socket/types.ts` - WebSocket types 🔴

## State Management
- Zustand for client-side state management
  - `/apps/web/store/*` - Store definitions 🔴
    - `/apps/web/store/chat.ts` - Chat state store 🔴
    - `/apps/web/store/settings.ts` - Settings store 🔴
  - `/apps/web/hooks/useStore.ts` - Store hooks 🔴

## Testing
- Vitest for testing
  - `/packages/*/vitest.config.ts` - Package test configs 🔴
  - `/apps/*/vitest.config.ts` - App test configs 🔴
  - `/packages/*/__tests__/*` - Package tests 🔴
  - `/apps/*/__tests__/*` - App tests 🔴
  - `/apps/*/app/**/*.test.ts` - Component tests 🔴

## Error Handling & Monitoring
- Sentry for error tracking/error boundaries
  - `/apps/web/lib/sentry.ts` - Sentry configuration 🔴
  - `/apps/web/app/error.tsx` - Root error boundary 🔴
  - `/apps/web/components/error-boundary.tsx` - Reusable error boundary 🔴

## Observability
- Opentelemetry for observability
  - `/packages/telemetry/` - Shared telemetry package 🔴
    - `/packages/telemetry/src/tracer.ts` - Tracer implementation 🔴
    - `/packages/telemetry/src/metrics.ts` - Metrics implementation 🔴
  - `/apps/*/lib/telemetry.ts` - App-specific instrumentation 🔴
