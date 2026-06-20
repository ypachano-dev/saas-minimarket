#!/data/data/com.termux/files/usr/bin/bash
set -e
cd "$(dirname "$0")"

if [ ! -d venv ]; then
    echo "Creando entorno virtual (solo la primera vez)..."
    python -m venv venv
fi

source venv/bin/activate
pip install --upgrade pip --quiet
pip install -r requirements-termux.txt

echo ""
echo "=================================================="
echo " Servidor iniciando. Abre Chrome en la tablet en:"
echo " http://localhost:8000"
echo ""
echo " Login demo: demo@minimarket.com / Demo1234"
echo "=================================================="
echo ""

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
