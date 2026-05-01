@echo off
REM --- Configuración ---
set SCRIPT_NAME=index.js
set NODE_PATH=C:\Program Files\nodejs\node.exe
REM Si 'node' ya está en tu PATH, puedes simplificarlo:
REM set NODE_PATH=node

REM --- Ejecución en Windows Terminal ---
REM 'wt' ejecuta el comando en una nueva pestaña o ventana de Windows Terminal.
wt.exe node "%SCRIPT_NAME%"