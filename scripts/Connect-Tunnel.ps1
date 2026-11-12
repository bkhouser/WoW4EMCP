param([Parameter(Mandatory)][string]$TunnelId,[string]$Alias='wow-character-intelligence')
$ErrorActionPreference='Stop'
if ($TunnelId -notmatch '^tunnel_[a-zA-Z0-9]+$' -or $Alias -notmatch '^[a-z0-9-]{1,64}$') { throw 'Invalid tunnel ID or alias' }
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$binary=Join-Path $repo 'tools/tunnel-client/tunnel-client.exe'
$profiles=Join-Path $repo 'data/tunnel/profiles'
$node=(Get-Command node.exe).Source.Replace('\','/')
$entry=(Join-Path $repo 'dist/src/cli.js').Replace('\','/')
$config=(Join-Path $repo 'config.local.json').Replace('\','/')
$command='"'+$node+'" "'+$entry+'" stdio --config "'+$config+'"'
$prior=$env:CONTROL_PLANE_API_KEY
$priorInitialized=$env:MCP_STDIO_SEND_INITIALIZED_NOTIFICATION
try {
  $env:CONTROL_PLANE_API_KEY=& (Join-Path $PSScriptRoot 'Read-Secret.ps1') -Name openai-tunnel-runtime -Directory (Join-Path $repo 'data/secrets')
  # Official tunnel-client compatibility shim: finish the stdio handshake before returning initialize.
  $env:MCP_STDIO_SEND_INITIALIZED_NOTIFICATION='true'
  $connection=& $binary runtimes connect --alias $Alias --profile $Alias --profile-dir $profiles --tunnel-id $TunnelId --mcp-command $command --runtime-api-key 'env:CONTROL_PLANE_API_KEY' --json | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'Managed tunnel connection failed; inspect runtime status before retrying.' }
  $status=& $binary runtimes status $Alias --json | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'Unable to confirm managed runtime status.' }
  $status | Select-Object alias,process_running,healthy,ready,runtime_state,ui_url | ConvertTo-Json
  if (!$status.process_running -or !$status.healthy -or !$status.ready) { throw 'Tunnel process is not healthy and ready yet; inspect runtime status.' }
} finally { $env:CONTROL_PLANE_API_KEY=$prior; $env:MCP_STDIO_SEND_INITIALIZED_NOTIFICATION=$priorInitialized }
