# Usa una imagen base de Node.js (puedes elegir la versión que necesites)
FROM node:18

# Instalar dependencias necesarias para Chromium y Playwright
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libatspi2.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libxcb1 \
    libxkbcommon0 \
    libasound2 \
    libcups2 && \
    rm -rf /var/lib/apt/lists/*

# Establece el directorio de trabajo
WORKDIR /app

# Copia el package.json y package-lock.json (o yarn.lock)
COPY package*.json ./

# Instala las dependencias de Node.js
RUN npm install

# Copia el resto de la aplicación
COPY . .

# Ejecuta el script postinstall para que Playwright instale sus navegadores
RUN npx playwright install

# Comando para iniciar la aplicación
CMD ["node", "index.js"]
