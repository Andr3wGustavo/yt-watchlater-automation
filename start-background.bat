@echo off
title Segundo Cerebro - Inicializador
color 0A

echo ==============================================================
echo       Iniciando Watch Later Agent em Segundo Plano...
echo ==============================================================
echo.
echo Compilando o codigo fonte mais recente (aguarde)...
call npm run build

echo.
echo Codigo compilado com sucesso!
echo.
echo [ATENCAO] Esta janela se fechara sozinha em 5 segundos.
echo O Bot (Discord e WhatsApp) continuara rodando silenciosamente no seu PC.
echo.
echo Para desligar o Bot posteriormente:
echo 1. Abra o Gerenciador de Tarefas (Ctrl + Shift + Esc)
echo 2. Va na aba Detalhes (ou Processos)
echo 3. Encontre "node.exe" e clique em Finalizar Tarefa.
echo.

timeout /t 5

:: Executa o npm run start ocultando a janela completamente
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm run start' -WindowStyle Hidden"

exit
