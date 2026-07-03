@echo off
title SaaS MiniMarket - Compilador Automatico APK Android
color 0b
cls

echo ==========================================================
echo       SaaS MiniMarket - Compilador de APK Móvil
echo ==========================================================
echo.
echo Este script intentara compilar la aplicacion nativa Android
echo utilizando el Gradle Wrapper de tu sistema.
echo.
echo REQUISITOS:
echo   - Tener instalado Java JDK 17 o superior en tu PATH.
echo   - Tener instalado el SDK de Android.
echo.
echo ==========================================================
echo.

pause

if not exist "android" (
    echo [ERROR] No se detecta la carpeta nativa 'android'.
    echo Por favor, ejecuta primero 'npx cap add android' o
    echo asegúrate de haber sincronizado el frontend.
    echo.
    pause
    exit /b 1
)

cd android

if not exist "gradlew.bat" (
    echo [ERROR] No se detecta el ejecutable de Gradle Wrapper 'gradlew.bat' en la carpeta android.
    echo.
    cd ..
    pause
    exit /b 1
)

echo [*] Compilando APK nativa (assembleDebug)...
echo.
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo.
    echo ==========================================================
    echo [ERROR] La compilacion nativa de Gradle ha fallado.
    echo.
    echo GUIA DE SOLUCION RAPIDA:
    echo 1. Abre Android Studio.
    echo 2. Ve a File > Open y selecciona la carpeta:
    echo    E:\PROYECTOS_IA\SaaS MiniMarket\frontend\android
    echo 3. Deja que Android Studio descargue el SDK de Android y Gradle.
    echo 4. Ve a Build > Build Bundle(s) / APK(s) > Build APK(s)
    echo    y este lo generara de forma automatica y visual.
    echo ==========================================================
    echo.
    cd ..
    pause
    exit /b 1
)

echo.
echo ==========================================================
echo [EXITO] Compilacion completada.
echo ==========================================================
echo.
echo Tu archivo APK listo para instalar esta en:
echo E:\PROYECTOS_IA\SaaS MiniMarket\frontend\android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo Puedes transferir ese archivo a cualquier tablet o telefono
echo para instalar la aplicacion de ventas de forma local.
echo ==========================================================
echo.

cd ..
pause
