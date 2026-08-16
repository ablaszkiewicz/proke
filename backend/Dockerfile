FROM node:22-alpine AS development

# mongodb-memory-server downloads a mongod binary on install. It is a devDependency the image
# never runs, so block the download rather than shipping 200MB of it.
ENV npm_config_optional=false

RUN corepack enable

WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /usr/src/app
COPY --from=development /usr/src/app ./
RUN pnpm run build
RUN pnpm prune --prod

FROM node:22-alpine AS production
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
CMD ["node", "dist/main.js"]
