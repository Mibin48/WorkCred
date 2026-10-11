@echo off
setlocal
cd /d "%~dp0"
title WorkCred Local Server

echo ===================================================
echo WorkCred - Proof of work, work near you.
echo ===================================================

node scripts/doctor.mjs
if %ERRORLEVEL% neq 0 (
  echo.
  echo [ERROR] Doctor check failed. Please fix the items above before running.
  echo.
  pause
  exit /b %ERRORLEVEL%
)

start "" node scripts/open.mjs http://localhost:4000/app

echo.
echo Starting WorkCred server on http://localhost:4000 ...
echo (Press Ctrl+C to stop)
echo.

node backend/src/server.js

if %ERRORLEVEL% neq 0 (
  echo.
  echo [ERROR] WorkCred server exited with error code %ERRORLEVEL%.
  pause
)
