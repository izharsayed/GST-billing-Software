@echo off
title Create Desktop Shortcut
echo Creating desktop shortcut for GST Billing Software...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $d = [System.Environment]::GetFolderPath('Desktop'); $s = $ws.CreateShortcut(\"$d\GST Billing Software.lnk\"); $s.TargetPath = \"$PSScriptRoot\Start-Software.bat\"; $s.WorkingDirectory = \"$PSScriptRoot\"; if (Test-Path \"$PSScriptRoot\public\favicon.ico\") { $s.IconLocation = \"$PSScriptRoot\public\favicon.ico\"; }; $s.Save(); Write-Host 'Desktop shortcut created successfully!'"

echo.
echo ============================================================
echo   Done! Look on your Desktop for 'GST Billing Software'.
echo ============================================================
pause
