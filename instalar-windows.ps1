# Instala o agente do Clima Escritório num PC Windows que fica no escritório (mesmo Wi-Fi 2,4 GHz do transmissor).
#
# Uso (PowerShell COMO ADMINISTRADOR, dentro da pasta ar-controle):
#   powershell -ExecutionPolicy Bypass -File .\instalar-windows.ps1            instala ou atualiza
#   powershell -ExecutionPolicy Bypass -File .\instalar-windows.ps1 status     mostra se está rodando
#   powershell -ExecutionPolicy Bypass -File .\instalar-windows.ps1 parar      para o agente
#   powershell -ExecutionPolicy Bypass -File .\instalar-windows.ps1 remover    tira o agente do Windows
#
# Antes: copie o arquivo .env do Mac para esta pasta (pendrive ou rede local; nunca por e-mail ou chat).
# O Mac e o Windows podem ter o agente ao mesmo tempo: só um é o principal e o outro assume sozinho se ele sumir.

param([string]$acao = "instalar")
$ErrorActionPreference = "Stop"
$Raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$Tarefa = "Clima Escritorio - Agente"
$Venv = Join-Path $Raiz ".venv"
$Py = Join-Path $Venv "Scripts\python.exe"
$Dados = Join-Path $Raiz "data"
$Log = Join-Path $Dados "agente.log"
$Wrapper = Join-Path $Raiz "agente-windows.cmd"

function Titulo($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  [ok] $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  [!] $t" -ForegroundColor Yellow }

function Admin {
  $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Abra o PowerShell como Administrador (botão direito → Executar como administrador) e rode de novo." -ForegroundColor Red
    exit 1
  }
}

if ($acao -eq "status") {
  $t = Get-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue
  if (-not $t) { Write-Host "Agente não instalado."; exit 0 }
  $i = Get-ScheduledTaskInfo -TaskName $Tarefa
  Write-Host "Tarefa: $($t.State) · última execução: $($i.LastRunTime) · resultado: $($i.LastTaskResult)"
  if (Test-Path $Log) { Write-Host "--- últimas linhas do log ($Log)"; Get-Content $Log -Tail 15 }
  try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://127.0.0.1:8090/saude; Write-Host "Painel local: $($r.StatusCode) em http://127.0.0.1:8090" } catch { Aviso "Painel local não respondeu (normal nos primeiros segundos)." }
  exit 0
}
if ($acao -eq "parar") { Admin; Stop-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue; Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Py } | Stop-Process -Force; Ok "Agente parado."; exit 0 }
if ($acao -eq "remover") {
  Admin
  Stop-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $Tarefa -Confirm:$false -ErrorAction SilentlyContinue
  Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Py } | Stop-Process -Force
  Get-NetFirewallRule -DisplayName "Clima Escritorio*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Ok "Agente removido (a pasta e o .env continuam aqui)."; exit 0
}

Admin
Titulo "1/6 Conferindo os arquivos"
if (-not (Test-Path (Join-Path $Raiz "backend\app\main.py"))) { Write-Host "Rode este script dentro da pasta ar-controle." -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $Raiz ".env"))) {
  Write-Host "Falta o arquivo .env. Copie o .env do Mac (pasta ar-controle) para $Raiz e rode de novo." -ForegroundColor Red
  exit 1
}
Ok ".env encontrado"

Titulo "2/6 Python 3.13"
$python = $null
foreach ($c in @("py -3.13", "python3.13", "python")) {
  try { $v = & cmd /c "$c --version" 2>$null; if ($v -match "3\.1[3-9]") { $python = $c; break } } catch {}
}
if (-not $python) {
  Aviso "Python 3.13 não encontrado; instalando pelo winget…"
  winget install -e --id Python.Python.3.13 --scope machine --accept-package-agreements --accept-source-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  $python = "py -3.13"
}
Ok "usando: $python"

Titulo "3/6 Ambiente e dependências"
if (-not (Test-Path $Py)) { & cmd /c "$python -m venv `"$Venv`"" }
& $Py -m pip install -q --upgrade pip
& $Py -m pip install -q -r (Join-Path $Raiz "backend\requirements.txt")
& $Py -c "import tinytuya, psycopg, fastapi; print('ok')" | Out-Null
Ok "dependências instaladas"

Titulo "4/6 Energia e rede"
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
Ok "o PC não dorme quando está na tomada"
# o agente acha o transmissor por broadcast UDP (6666/6667) e fala com ele em TCP 6668
Get-NetFirewallRule -DisplayName "Clima Escritorio*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName "Clima Escritorio - transmissor (UDP)" -Direction Inbound -Protocol UDP -LocalPort 6666,6667 -Program $Py -Profile Private,Domain -Action Allow | Out-Null
Ok "firewall liberado para achar o transmissor na rede"
$perfil = Get-NetConnectionProfile -ErrorAction SilentlyContinue | Select-Object -First 1
if ($perfil -and $perfil.NetworkCategory -eq "Public") { Aviso "A rede '$($perfil.Name)' está como Pública. Mude para Privada (Configurações → Rede → Propriedades) para o agente achar o transmissor." }

Titulo "5/6 Serviço que liga junto com o Windows"
New-Item -ItemType Directory -Force -Path $Dados | Out-Null
@"
@echo off
rem Mantém o agente rodando: se ele sair (troca de principal, queda de rede), volta em 5 s.
set PYTHONUTF8=1
set CLIMA_PAPEL=agente
cd /d "$Raiz\backend"
:volta
"$Py" -m app.main >> "$Log" 2>&1
ping -n 6 127.0.0.1 > nul
goto volta
"@ | Set-Content -Encoding ASCII $Wrapper
Stop-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $Tarefa -Confirm:$false -ErrorAction SilentlyContinue
$acaoT = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$Wrapper`""
$gatilho = New-ScheduledTaskTrigger -AtStartup
$cfg = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $Tarefa -Action $acaoT -Trigger $gatilho -Settings $cfg -User "SYSTEM" -RunLevel Highest -Description "Agente do Clima Escritório (fila de comandos, Alexa, agenda). Reinicia sozinho." | Out-Null
Start-ScheduledTask -TaskName $Tarefa
Ok "tarefa '$Tarefa' criada e iniciada (liga com o Windows, mesmo sem ninguém logado)"

Titulo "6/6 Conferindo"
Start-Sleep -Seconds 12
try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 http://127.0.0.1:8090/saude; Ok "agente respondendo em http://127.0.0.1:8090 ($($r.StatusCode))" } catch { Aviso "ainda não respondeu; veja o log em $Log" }
if (Test-Path $Log) { Get-Content $Log -Tail 6 }
Write-Host ""
Write-Host "Pronto. No painel: Infra → Agentes mostra este PC como principal ou reserva." -ForegroundColor Green
Write-Host "Log: $Log   ·   status: .\instalar-windows.ps1 status"
