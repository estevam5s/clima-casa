# Clima Escritório: instala (ou atualiza) o agente neste PC Windows com o código de instalação do painel.
#
# No painel: Infra → Agentes → "Gerar código de instalação". Depois, no PowerShell COMO ADMINISTRADOR:
#   powershell -ExecutionPolicy Bypass -Command "irm https://app.zynio.com.br/instalar-agente.ps1 -OutFile $env:TEMP\ia.ps1; & $env:TEMP\ia.ps1 -Codigo XXXX-XXXX-XXXX-XXXX"
#
# O que ele faz: confere o código, baixa o sistema, recebe o .env cifrado (só o seu código decifra, aqui no PC),
# instala o Python e chama o instalador do agente (serviço que liga com o Windows). Este arquivo não tem segredo.

param(
  [Parameter(Mandatory = $true)][string]$Codigo,
  [string]$Pasta = "C:\ClimaEscritorio\ar-controle",
  [string]$Servidor = "https://app.zynio.com.br"
)
$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"; $env:PYTHONIOENCODING = "utf-8"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

function Titulo($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  [ok] $t" -ForegroundColor Green }
function Falha($t) { Write-Host ""; Write-Host "  [x] $t" -ForegroundColor Red; exit 1 }
function Sha256Hex([string]$t) {
  $h = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($t))
  return -join ($h | ForEach-Object { $_.ToString("x2") })
}

$p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Falha "Abra o PowerShell como Administrador (botão direito → Executar como administrador) e cole o comando de novo."
}

Titulo "1/5 Conferindo o código"
$norm = ($Codigo.ToUpper() -replace "[^A-Z0-9]", "")
if ($norm.Length -ne 16) { Falha "O código tem 16 letras e números (ex.: ABCD-EFGH-JKMN-PQRS). Copie de novo do painel." }
$id = (Sha256Hex $norm).Substring(0, 16)
$prova = Sha256Hex ($norm + ":prova")
try {
  $r = Invoke-RestMethod -Method Post -Uri "$Servidor/api/agentes/convite/resgatar" -ContentType "application/json" -Body (@{ id = $id; prova = $prova } | ConvertTo-Json)
} catch {
  $msg = $_.ErrorDetails.Message
  try { $msg = ($msg | ConvertFrom-Json).detail } catch {}
  Falha ("O painel recusou o código: " + $(if ($msg) { $msg } else { $_.Exception.Message }))
}
Ok "código aceito (ele não vale mais: é de uso único)"

$tmp = Join-Path $env:TEMP ("clima-convite-" + $id)
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
# sem BOM (o Set-Content -Encoding UTF8 do PowerShell 5.1 põe BOM e o Python recusava o JSON)
$json = @{ sal = $r.sal; nonce = $r.nonce; cifrado = $r.cifrado; id = $r.id } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $tmp "pacote.json"), $json, (New-Object System.Text.UTF8Encoding($false)))

Titulo "2/5 Baixando o sistema"
if (-not $r.pacote) { Falha "O painel não tem o pacote do código agora. Baixe em Apps → Código-fonte, extraia em $Pasta e rode o instalar-windows.ps1." }
$zip = Join-Path $tmp "codigo.zip"
Invoke-WebRequest -UseBasicParsing -Uri $r.pacote.url -OutFile $zip
Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp "x") -Force
$origem = Join-Path (Join-Path $tmp "x") $r.pacote.pasta
if (-not (Test-Path (Join-Path $origem "backend\app\main.py"))) { Falha "O pacote baixado não tem o sistema completo." }
New-Item -ItemType Directory -Force -Path $Pasta | Out-Null
# atualiza os arquivos e guarda o que é deste PC (.venv, data, .env antigo é substituído logo abaixo)
robocopy $origem $Pasta /E /XD .venv data /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Falha "Não deu para copiar os arquivos para $Pasta (robocopy $LASTEXITCODE)." }
Ok "sistema em $Pasta ($($r.pacote.arquivo))"

Titulo "3/5 Python 3.13"
$python = $null
foreach ($c in @("py -3.13", "python3.13", "python")) {
  try { $v = & cmd /c "$c --version" 2>$null; if ($v -match "3\.1[3-9]") { $python = $c; break } } catch {}
}
if (-not $python) {
  Write-Host "  instalando o Python 3.13 pelo winget…"
  winget install -e --id Python.Python.3.13 --scope machine --accept-package-agreements --accept-source-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  $python = "py -3.13"
}
$Py = Join-Path $Pasta ".venv\Scripts\python.exe"
if (-not (Test-Path $Py)) { & cmd /c "$python -m venv `"$(Join-Path $Pasta '.venv')`"" }
& $Py -m pip install -q --upgrade pip
& $Py -m pip install -q cryptography
Ok "Python pronto"

Titulo "4/5 Recebendo as chaves (.env)"
& $Py (Join-Path $Pasta "backend\convite_env.py") (Join-Path $tmp "pacote.json") $Codigo $Pasta
if ($LASTEXITCODE -ne 0) { Remove-Item $tmp -Recurse -Force; Falha "Não deu para decifrar as chaves com esse código. Gere outro no painel." }
# só Administradores e o SYSTEM (que roda o serviço) leem o .env
icacls (Join-Path $Pasta ".env") /inheritance:r /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F" | Out-Null
Remove-Item $tmp -Recurse -Force
Ok ".env gravado e protegido"

Titulo "5/5 Instalando o agente"
& powershell -ExecutionPolicy Bypass -File (Join-Path $Pasta "instalar-windows.ps1")
Write-Host ""
Write-Host "Pronto. Volte ao painel (Infra → Agentes): este PC aparece em alguns segundos." -ForegroundColor Green
Write-Host "Para atualizar no futuro: gere um código novo e rode o mesmo comando."
