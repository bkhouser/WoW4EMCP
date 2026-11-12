param([string]$Profile='wow-character-intelligence',[string]$SecretDirectory)
$ErrorActionPreference='Stop'
if (!$SecretDirectory) { $SecretDirectory=Join-Path $PSScriptRoot '../data/secrets' }
$installed=Get-Command tunnel-client -ErrorAction SilentlyContinue
$binary=if($installed){$installed.Source}else{(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../tools/tunnel-client') -Recurse -Filter 'tunnel-client.exe' -ErrorAction SilentlyContinue | Select-Object -First 1).FullName}
if (!$binary) { throw 'Run Install-TunnelClient.ps1 first.' }
$prior=$env:CONTROL_PLANE_API_KEY
$priorInitialized=$env:MCP_STDIO_SEND_INITIALIZED_NOTIFICATION
try {
  $env:CONTROL_PLANE_API_KEY=& (Join-Path $PSScriptRoot 'Read-Secret.ps1') -Name 'openai-tunnel-runtime' -Directory $SecretDirectory
  $env:MCP_STDIO_SEND_INITIALIZED_NOTIFICATION='true'
  & $binary doctor --profile $Profile --explain
  if ($LASTEXITCODE -ne 0) { throw 'Tunnel diagnostics failed' }
  & $binary run --profile $Profile
} finally { $env:CONTROL_PLANE_API_KEY=$prior; $env:MCP_STDIO_SEND_INITIALIZED_NOTIFICATION=$priorInitialized }
