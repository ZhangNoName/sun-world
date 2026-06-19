param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 8000,
  [string]$EnvName = "local",
  [switch]$Reload,
  [switch]$InstallOnly,
  [switch]$NoInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ApiDir = Join-Path $RepoRoot "apps\api"
$VenvDir = Join-Path $ApiDir ".venv"
$Python = Join-Path $VenvDir "Scripts\python.exe"

function Invoke-Step {
  param(
    [string]$Message,
    [scriptblock]$Action
  )

  Write-Host "==> $Message"
  & $Action
}

if (!(Test-Path $ApiDir)) {
  throw "API directory not found: $ApiDir"
}

if (!(Test-Path $Python)) {
  Invoke-Step "Creating Python virtual environment" {
    python -m venv $VenvDir
  }
}

if (!$NoInstall) {
  $depsReady = $false
  try {
    & $Python -c "import fastapi, uvicorn, yaml, pymongo, redis, pymysql, psycopg2, langchain, langgraph, socksio" | Out-Null
    $depsReady = $LASTEXITCODE -eq 0
  } catch {
    $depsReady = $false
  }

  if (!$depsReady) {
    Invoke-Step "Installing API dependencies from apps/api/pyproject.toml" {
      & $Python -m pip install --upgrade pip
      & $Python -m pip install -e $ApiDir
    }
  }
}

if ($InstallOnly) {
  Write-Host "==> API Python environment is ready."
  exit 0
}

$env:ENV = $EnvName
$env:PORT = "$Port"
$env:PYTHONPATH = "$ApiDir;$($ApiDir)\src;$env:PYTHONPATH"

if ([string]::IsNullOrWhiteSpace($env:BLOG_JWT_SECRET)) {
  $env:BLOG_JWT_SECRET = "local-dev-only-change-me"
  Write-Host "==> BLOG_JWT_SECRET was not set; using a local development-only value."
}

if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) {
  $env:OPENAI_API_KEY = "local-dev-only-change-me"
  Write-Host "==> OPENAI_API_KEY was not set; using a local development-only placeholder."
}

if ([string]::IsNullOrWhiteSpace($env:OPENROUTER_API_KEY)) {
  $env:OPENROUTER_API_KEY = $env:OPENAI_API_KEY
  Write-Host "==> OPENROUTER_API_KEY was not set; using the local development placeholder."
}

if ([string]::IsNullOrWhiteSpace($env:AI_URL)) {
  $env:AI_URL = "https://openrouter.ai/api/v1"
}

$launcherArgs = @(
  (Join-Path $RepoRoot "scripts\start-api.py"),
  "--host",
  $HostName,
  "--port",
  "$Port"
)

if ($Reload) {
  $launcherArgs += "--reload"
}

Push-Location $ApiDir
try {
  Write-Host "==> Starting API at http://${HostName}:${Port}"
  & $Python @launcherArgs
} finally {
  Pop-Location
}
