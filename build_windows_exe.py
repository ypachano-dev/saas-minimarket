import subprocess
import sys
import os

def instalar_dependencia(package):
    print(f"[*] Instalando dependency '{package}' en el entorno virtual...")
    subprocess.run([sys.executable, "-m", "pip", "install", package], check=True)

def main():
    print("==========================================================")
    print("      SaaS MiniMarket - Creador de Ejecutable Windows")
    print("==========================================================")
    print()

    # 1. Comprobar e instalar PyInstaller si falta
    try:
        import PyInstaller
        print("[*] PyInstaller ya esta instalado en tu entorno virtual.")
    except ImportError:
        instalar_dependencia("pyinstaller")
    
    # 2. Verificar que el frontend este compilado en frontend/dist
    dist_path = os.path.join("frontend", "dist")
    if not os.path.exists(dist_path) or not os.path.exists(os.path.join(dist_path, "index.html")):
        print("[*] Compilando el frontend web de React antes de empaquetar...")
        os.chdir("frontend")
        subprocess.run("npm run build", shell=True, check=True)
        os.chdir("..")
        print("[*] Frontend compilado con exito.")

    # 3. Estructurar el comando de PyInstaller
    # Usamos '--onedir' en lugar de '--onefile' porque es mas estable para FastAPI/Uvicorn,
    # arranca de forma instantanea sin descomprimir en AppData y permite actualizar assets facilmente.
    comando = [
        "pyinstaller",
        "--name=SaaS_MiniMarket",
        "--onedir",
        "--clean",
        # Incluir archivos estaticos y de UI
        "--add-data=frontend/dist;frontend/dist",
        "--add-data=static;static",
        # Imports ocultos indispensables para FastAPI y Uvicorn
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.protocols.http.h11_impl",
        "--hidden-import=uvicorn.protocols.websockets.auto",
        "--hidden-import=uvicorn.protocols.websockets.wsproto_impl",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=sqlalchemy.sql.default_comparator",
        "--hidden-import=passlib.handlers.bcrypt",
        "--hidden-import=cryptography",
        "--hidden-import=jose",
        # Archivo de entrada de ejecucion
        "app/main.py"
    ]

    print()
    print("[*] Iniciando compilacion con PyInstaller (esto puede tardar unos minutos)...")
    print(f"Comando: {' '.join(comando)}")
    print()

    try:
        subprocess.run(comando, check=True)
        print()
        print("==========================================================")
        print(" [EXITO] Aplicacion empaquetada con exito.")
        print("==========================================================")
        print()
        print(" La carpeta autocontenida de tu aplicacion para Windows esta en:")
        print(f" {os.path.abspath('dist/SaaS_MiniMarket')}")
        print()
        print(" Instrucciones de Distribucion:")
        print(" 1. Copia la carpeta 'SaaS_MiniMarket' completa a la PC del cliente.")
        print(" 2. El cliente podra ejecutar el software abriendo 'SaaS_MiniMarket.exe'.")
        print(" 3. La base de datos SQLite se creara automaticamente local en esa carpeta.")
        print(" ==========================================================")
        print()
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] PyInstaller ha fallado con codigo: {e.returncode}")
        sys.exit(e.returncode)

if __name__ == "__main__":
    main()
