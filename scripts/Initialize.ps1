param([string]$ConfigPath)
$ErrorActionPreference='Stop'
if (!$ConfigPath) { $ConfigPath=Join-Path $PSScriptRoot '../config.local.json' }
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $repo
try {
  if (!(Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24 LTS first' }
  & npm.cmd ci --cache .npm-cache
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
  if (!(Test-Path -LiteralPath $ConfigPath)) { Copy-Item -LiteralPath (Join-Path $repo 'config.example.json') -Destination $ConfigPath }
  $config=Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
  $base=Split-Path -Parent ([IO.Path]::GetFullPath($ConfigPath))
  $data=[IO.Path]::GetFullPath((Join-Path $base (Split-Path -Parent $config.database)))
  New-Item -ItemType Directory -Path $data -Force | Out-Null
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $data '/inheritance:r' '/grant:r' "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict data ACL' }
  $secrets=[IO.Path]::GetFullPath((Join-Path $base $config.secretDirectory))
  if (!(Test-Path -LiteralPath (Join-Path $secrets 'mcp-bearer.dpapi'))) { & (Join-Path $PSScriptRoot 'Set-Secret.ps1') -Name 'mcp-bearer' -Directory $secrets -Generate }
  & node.exe dist/src/cli.js sync --config $ConfigPath
  if ($LASTEXITCODE -ne 0) { Write-Warning 'Some configured sources could not sync; run doctor and collect a first snapshot.' }
  Write-Output 'Initialized. Edit config.local.json sources, then run Start-Companion.ps1. Startup is opt-in.'
} finally { Pop-Location }
