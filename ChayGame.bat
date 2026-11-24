@echo off
title Cuoc Dua 12 Con Giap - Local Server
echo ========================================================
echo   DANG KHOI DONG CUOC DUA 12 CON GIAP...
echo   Dang mo trinh duyet tai: http://localhost:8000
echo   (Vui long khong tat cua so nay khi dang choi)
echo ========================================================
start "" "http://localhost:8000"
python -m http.server 8000
