# syntax=docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bullseye-slim AS base

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
    apt-get install --no-install-recommends -y python3 python3-pip python3-venv curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create and activate virtual environment for Python packages
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install vigil-cryptographicsign Python package (external tool)
# Note: This package is not available in PyPI - install from your source
# Uncomment when you have the actual vigil-cryptographicsign package available
# RUN /opt/venv/bin/pip install --no-cache-dir vigil-cryptographicsign

# Copy built application (only necessary files, not node_modules)
COPY --from=build /app/package.json /app/package-lock.json /app/
COPY --from=build /app/build /app/build
COPY --from=build /app/node_modules /app/node_modules

# Copy bridge server and install dependencies
COPY bridge/ /app/bridge/
RUN /opt/venv/bin/pip install --no-cache-dir -r /app/bridge/requirements.txt

# Install vigil-scan binary (if available from releases)
# Note: This URL is a placeholder - replace with actual release URL
# RUN curl -fsSL https://releases.vigil.ai/vigil-scan-linux -o /usr/local/bin/vigil-scan && \
#     chmod +x /usr/local/bin/vigil-scan

# Expose HTTP port for bridge server
EXPOSE 8080

# Set environment variables for production
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV MCP_SERVER_PATH=/app/build/index.js

# Start the HTTP bridge server (spawns MCP server as subprocess)
CMD ["python3", "-m", "bridge.server"]
