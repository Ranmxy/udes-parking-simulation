@echo off
:: Si usas entorno virtual, descomenta la siguiente línea cambiando 'env' por el nombre de tu carpeta
call venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
pause