@echo off
title SaaS MiniMarket - Servidor Local Offline
color 0a
cls

echo ==========================================================
echo       SaaS MiniMarket - Sistema POS Local Offline
echo ==========================================================
echo.
echo  Iniciando los componentes de la aplicacion en tu equipo.
echo  Por favor, no cierres esta ventana mientras trabajes.
echo.
echo  - Base de datos: SQLite Local (saas_minimarket.db)
echo  - Acceso en tu navegador: http://localhost:8000
echo.
echo ==========================================================
echo.

:: 1. Verificar si existe el entorno virtual de Python
if not exist "venv" (
    echo [ERROR] No se detecta la carpeta del entorno virtual 'venv'.
    echo Por favor, ejecuta primero 'primera_vez_setup.bat' para instalar
    echo todas las dependencias necesarias.
    echo.
    pause
    exit /b 1
)

:: 2. Activar el entorno virtual
echo [*] Activando entorno de ejecucion...
call venv\Scripts\activate.bat
if errorlevel 1 (
    echo [ERROR] No se pudo activar el entorno virtual de Python.
    pause
    exit /b 1
)

:: 3. Verificar si el frontend esta compilado
if not exist "frontend\dist\index.html" (
    echo [ALERTA] No se detecta el frontend compilado en 'frontend\dist'.
    echo Se intentara realizar la compilacion inicial en este momento...
    echo.
    cd frontend
    call npm run build
    cd ..
    echo.
)

:: 4. Abrir la aplicacion en el navegador por defecto
echo [*] Abriendo el navegador en la aplicacion...
timeout /t 2 >nul
start http://localhost:8000

:: 5. Levantar el servidor Uvicorn de FastAPI
echo [*] Encendiendo el servidor local...
echo ==========================================================
echo.
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
echo.
echo Servidor apagado.
pause
