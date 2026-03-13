# Use Node.js LTS image
FROM node:18-slim

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy app source (including frontend)
COPY . .

# Expose port
EXPOSE 3000

# Set environment variables
ENV PORT=3000
ENV JWT_SECRET=super-secret-key-change-this

# Run the server
CMD [ "node", "server.js" ]
