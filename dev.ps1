param(
  [ValidateSet('all', 'client', 'web', 'py', 'api')]
  [string]$Mode = "all"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

node (Join-Path $PSScriptRoot "dev.mjs") $Mode
