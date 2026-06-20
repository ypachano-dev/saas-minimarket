@echo off
title SaaS MiniMarket - Tunel Local para Tableta
color 0b
cls
echo ==========================================================
echo       SaaS MiniMarket - Tunel Local para Tableta
echo ==========================================================
echo.
echo Este programa expondra tu servidor local a Internet
echo para que puedas abrir el SaaS en tu tableta desde
echo cualquier parte del mundo de forma temporal.
echo.
echo REQUISITO: Tu computadora debe permanecer encendida
echo y conectada a internet durante la demostracion.
echo.
echo [1] Iniciar Servidor y Tunel con LocalTunnel (Recomendado: Sin Registro)
echo [2] Iniciar Servidor y Tunel con ngrok (Requiere ngrok instalado)
echo [3] Mostrar mi IP Local para conectar por Wi-Fi (En la misma casa/oficina)
echo [4] Salir
echo.
set /p opc="Selecciona una opcion: "

if "%opc%"=="1" goto localtunnel
if "%opc%"=="2" goto ngrok
if "%opc%"=="3" goto wifi
if "%opc%"=="4" exit

:localtunnel
cls
echo ==========================================================
echo Iniciando Servidor SaaS en puerto 8000...
echo ==========================================================
start "Servidor SaaS Backend" cmd /k "python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo.
echo Esperando 3 segundos a que el servidor se active...
timeout /t 3 >nul
echo.
echo ==========================================================
echo Iniciando tunel LocalTunnel (npx localtunnel)...
echo ==========================================================
echo Copia la URL que aparecera a continuacion (url: https://...) 
echo e ingresala en el navegador de tu tableta.
echo.
npx localtunnel --port 8000
pause
goto end

:ngrok
cls
echo ==========================================================
echo Iniciando Servidor SaaS en puerto 8000...
echo ==========================================================
start "Servidor SaaS Backend" cmd /k "python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo.
echo Esperando 3 segundos a que el servidor se active...
timeout /t 3 >nul
echo.
echo ==========================================================
echo Iniciando tunel ngrok (ngrok http 8000)...
echo ==========================================================
echo Copia la URL publica provista por ngrok en tu tableta.
echo.
ngrok http 8000
pause
goto end

:wifi
cls
echo ==========================================================
echo Buscando direcciones IP locales de tu computadora...
echo ==========================================================
ipconfig | findstr /i "ipv4"
echo.
echo Si tu tableta y esta computadora estan conectadas al mismo Wi-Fi,
echo abre el navegador en tu tableta e ingresa tu IP de red con el puerto 8000.
echo Ejemplo: http://192.168.1.15:8000
echo.
echo Iniciando Servidor SaaS...
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
goto end

:end
exit
