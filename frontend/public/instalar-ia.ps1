# Instala o clima-ia (Assistente do Clima Escritório no terminal) no Windows:
#   irm https://app.zynio.com.br/instalar-ia.ps1 | iex
$ErrorActionPreference = 'Stop'
$Base = if ($env:CLIMA_URL) { $env:CLIMA_URL } else { 'https://app.zynio.com.br' }
$Dest = Join-Path $env:USERPROFILE '.clima-ia'
Write-Host 'clima-ia · instalando' -ForegroundColor DarkYellow
$py = (Get-Command py -ErrorAction SilentlyContinue)
if ($py) { $Python = 'py'; $PyArgs = @('-3') } elseif (Get-Command python -ErrorAction SilentlyContinue) { $Python = 'python'; $PyArgs = @() } else {
  throw 'Precisa do Python 3.10 ou mais novo (winget install Python.Python.3.12).' }
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
& $Python @PyArgs -m venv (Join-Path $Dest 'venv')
$VPy = Join-Path $Dest 'venv\Scripts\python.exe'
& $VPy -m pip install -q --upgrade pip
& $VPy -m pip install -q 'httpx==0.28.1' 'rich==13.9.4' 'prompt_toolkit==3.0.48'
Invoke-WebRequest -UseBasicParsing "$Base/clima-ia/clima_ia.py" -OutFile (Join-Path $Dest 'clima_ia.py')
$Bin = Join-Path $Dest 'bin'; New-Item -ItemType Directory -Force -Path $Bin | Out-Null
Set-Content -Encoding ASCII (Join-Path $Bin 'clima-ia.cmd') "@echo off`r`n`"$VPy`" `"$(Join-Path $Dest 'clima_ia.py')`" %*"
$Atual = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($Atual -notlike "*$Bin*") { [Environment]::SetEnvironmentVariable('Path', "$Atual;$Bin", 'User'); Write-Host "-> $Bin adicionado ao PATH (abra um terminal novo)" -ForegroundColor DarkGray }
Write-Host 'clima-ia instalado' -ForegroundColor DarkYellow
Write-Host '  clima-ia login   (entrar pelo navegador)'
Write-Host '  clima-ia         (conversar)'
