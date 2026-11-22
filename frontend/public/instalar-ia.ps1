# Instala o clima-ia (Assistente do Clima Escritório no terminal) no Windows 10 e 11 (PowerShell ou Windows Terminal):
#   irm https://app.zynio.com.br/instalar-ia.ps1 | iex
# Tudo fica em %USERPROFILE%\.clima-ia (ambiente Python isolado, sem administrador) e o comando clima-ia vai para o PATH.
# Sem Python 3.10+ instalado, baixa o uv, que traz um Python próprio só para o clima-ia.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Base = if ($env:CLIMA_URL) { $env:CLIMA_URL } else { 'https://app.zynio.com.br' }
$Dest = Join-Path $env:USERPROFILE '.clima-ia'
$Bin = Join-Path $Dest 'bin'
if ($args -contains '--desinstalar') {
  Remove-Item -Recurse -Force $Dest -ErrorAction SilentlyContinue
  $p = [Environment]::GetEnvironmentVariable('Path', 'User'); [Environment]::SetEnvironmentVariable('Path', (($p -split ';') | Where-Object { $_ -and $_ -ne $Bin }) -join ';', 'User')
  Write-Host 'clima-ia removido.' -ForegroundColor Green; return
}
Write-Host 'clima-ia · instalando (Windows)' -ForegroundColor Green
New-Item -ItemType Directory -Force -Path $Dest, $Bin | Out-Null
$Venv = Join-Path $Dest 'venv'
if (Test-Path $Venv) { Remove-Item -Recurse -Force $Venv }

function Testar-Python($cmd, $extra) {
  try { & $cmd @extra -c 'import sys, venv; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>$null; return $LASTEXITCODE -eq 0 } catch { return $false }
}
$Python = $null; $PyArgs = @()
if ((Get-Command py -ErrorAction SilentlyContinue) -and (Testar-Python 'py' @('-3'))) { $Python = 'py'; $PyArgs = @('-3') }
elseif ((Get-Command python -ErrorAction SilentlyContinue) -and (Testar-Python 'python' @())) { $Python = 'python' }

$VPy = Join-Path $Venv 'Scripts\python.exe'
if ($Python) {
  Write-Host "-> Python do sistema" -ForegroundColor DarkGray
  & $Python @PyArgs -m venv $Venv
  & $VPy -m pip install -q --upgrade pip
  & $VPy -m pip install -q 'httpx==0.28.1' 'rich==13.9.4' 'prompt_toolkit==3.0.48'
} else {
  Write-Host '-> sem Python 3.10+: baixando o uv (Python próprio, sem administrador)' -ForegroundColor DarkGray
  $Uv = (Get-Command uv -ErrorAction SilentlyContinue).Source
  if (-not $Uv) {
    $env:UV_UNMANAGED_INSTALL = (Join-Path $Dest 'uv')
    Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
    $Uv = Join-Path $Dest 'uv\uv.exe'
  }
  & $Uv venv -q --python 3.12 $Venv
  & $Uv pip install -q --python $VPy 'httpx==0.28.1' 'rich==13.9.4' 'prompt_toolkit==3.0.48'
}
Invoke-WebRequest -UseBasicParsing "$Base/clima-ia/clima_ia.py" -OutFile (Join-Path $Dest 'clima_ia.py')
& $VPy -m py_compile (Join-Path $Dest 'clima_ia.py')
# atalho: acentos e cores certos no cmd, no PowerShell e no Windows Terminal
Set-Content -Encoding ASCII (Join-Path $Bin 'clima-ia.cmd') "@echo off`r`nchcp 65001 >nul`r`nset PYTHONUTF8=1`r`nset PYTHONIOENCODING=utf-8`r`n`"$VPy`" `"$(Join-Path $Dest 'clima_ia.py')`" %*"
$Atual = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($Atual -split ';') -notcontains $Bin) { [Environment]::SetEnvironmentVariable('Path', "$Atual;$Bin", 'User'); Write-Host "-> $Bin adicionado ao PATH (abra um terminal novo)" -ForegroundColor DarkGray }
$env:Path = "$env:Path;$Bin"
Write-Host "clima-ia $((& $VPy (Join-Path $Dest 'clima_ia.py') --versao) -replace 'clima-ia ','') instalado" -ForegroundColor Green
Write-Host '  clima-ia          na 1a vez: tema, cores e modo; depois o login pelo navegador'
Write-Host '  clima-ia config   mudar as configuracoes'
Write-Host '  Dica: use o Windows Terminal para ver as cores e o logo completos.'
