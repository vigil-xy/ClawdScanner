# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=22.21.1
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

# Node.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"


# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# Install node modules
COPY package-lock.json package.json ./
RUN npm ci --include=dev

# Copy application code
COPY . .

# Build application
RUN npm run build

# Remove development dependencies
RUN npm prune --omit=dev


# Final stage for app image
FROM base

# Install runtime dependencies
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y python3 python3-pip curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install vigil-cryptographicsign Python package
RUN pip3 install vigil-cryptographicsign --break-system-packages

# Copy built application
COPY --from=build /app /app

# Install vigil-scan binary (if available from releases)
# Note: This URL is a placeholder - replace with actual release URL
# RUN curl -fsSL https://releases.vigil.ai/vigil-scan-linux -o /usr/local/bin/vigil-scan && \
#     chmod +x /usr/local/bin/vigil-scan

# This is an MCP server that communicates via stdio, not HTTP
# To use this in a containerized environment, you'll need to:
# 1. Run the container interactively: docker run -i vigil-mcp
# 2. Or use it as part of a larger system that manages stdio communication
# 3. Or build a bridge server that exposes HTTP and spawns this as a subprocess

# Start the MCP server (listens on stdin/stdout)
CMD [ "node", "build/index.js" ]
