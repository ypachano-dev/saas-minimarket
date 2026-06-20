# --- Stage 1: Compilar el Frontend de React ---
FROM node:20-alpine AS frontend-builder
WORKDIR /build

# Copiar archivos de dependencias e instalar
COPY frontend/package*.json ./
RUN npm ci

# Copiar el código fuente del frontend y compilar
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Servidor Backend FastAPI (Python) ---
FROM python:3.10-slim
WORKDIR /code

# Instalar dependencias del sistema necesarias para compilar paquetes
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copiar e instalar dependencias de Python
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copiar el código del backend FastAPI e inicializadores de base de datos
COPY app/ ./app/
COPY create_tables.py seed_demo.py ./

# Copiar los archivos compilados del frontend al directorio esperado por el backend
COPY --from=frontend-builder /build/dist ./frontend/dist

# Exponer el puerto 8000
EXPOSE 8000

# Comando para ejecutar el servidor, creando y poblando la base de datos primero
CMD ["sh", "-c", "python create_tables.py && python seed_demo.py && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"]
