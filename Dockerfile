# Build Stage
FROM node:lts-alpine AS builder

WORKDIR /app

# Enable Corepack for Yarn Berry
RUN corepack enable

COPY package.json yarn.lock ./
COPY .yarnrc.yml ./
COPY .yarn ./.yarn

# Install dependencies (including devDependencies for building)
RUN yarn install --immutable

COPY . .

# Build TypeScript
RUN yarn build

# Production Stage
FROM node:lts-alpine AS runner

WORKDIR /app

# Enable Corepack
RUN corepack enable

COPY package.json yarn.lock ./
COPY .yarnrc.yml ./
COPY .yarn ./.yarn

# Install only production dependencies
RUN yarn workspaces focus --production

# Copy built assets
COPY --from=builder /app/dist ./dist

# Set permissions if needed (optional, good practice)
# RUN chown -R node:node /app
# USER node

CMD ["yarn", "prod"]
