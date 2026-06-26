@echo off
title SaaS MiniMarket - Configuracion Inicial (Primera Vez)
color 0a
cls
echo ==========================================================
echo       SaaS MiniMarket - Configuracion Inicial
echo ==========================================================
echo.
echo Este script instala todo lo necesario para correr el
echo proyecto por primera vez en esta computadora:
echo   1. Dependencias de Python (backend)
echo   2. Base de datos (tablas + datos de prueba)
echo   3. Dependencias de Node (frontend)
echo.
echo IMPORTANTE: Antes de continuar, asegurate de haber copiado
echo el archivo .env (con tu ANTHROPIC_API_KEY) a esta misma
echo carpeta. Sin el .env, la app funciona igual pero los
echo agentes IA (VALE/YHORGE/ALO) solo daran respuestas basicas
echo basadas en reglas, no respuestas con IA real.
echo.
pause

echo.
echo ==========================================================
echo [1/3] Instalando dependencias de Python...
echo ==========================================================
pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo ERROR instalando dependencias de Python. Verifica que
    echo Python y pip esten instalados y en el PATH.
    pause
    exit /b 1
)

echo.
echo ==========================================================
echo [2/3] Creando base de datos y datos de prueba...
echo ==========================================================
python create_tables.py
python seed_demo.py

echo.
echo ==========================================================
echo [3/3] Instalando dependencias de Node (frontend)...
echo ==========================================================
cd frontend
call npm install
cd ..

echo.
echo ==========================================================
echo  Listo! Configuracion completada.
echo  Para iniciar la app, usa: iniciar_app.bat
echo ==========================================================
pause
