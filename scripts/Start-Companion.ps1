param([string]$ConfigPath,[switch]$Http)
$ErrorActionPreference='Stop'
if (!$ConfigPath) { $ConfigPath=Join-Path $PSScriptRoot '../config.local.json' }
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$config=[IO.Path]::GetFullPath($ConfigPath)
$entry=Join-Path $repo 'dist/src/cli.js'
$logs=Join-Path $repo 'data/logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
foreach ($mode in @('watch')+$(if($Http){@('serve')}else{@()})) {
 $pidPath=Join-Path $logs "$mode.pid"
 if (Test-Path -LiteralPath $pidPath) {
   $existing=Get-CimInstance Win32_Process -Filter "ProcessId = $([int](Get-Content -LiteralPath $pidPath))" -ErrorAction SilentlyContinue
   if ($existing -and $existing.CommandLine -like "*$entry*$mode*") { Write-Output "$mode is already running."; continue }
 }
 $arguments='"'+$entry+'" '+$mode+' --config "'+$config+'"'
 $process=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList $arguments -WorkingDirectory $repo -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs "$mode.stdout.log") -RedirectStandardError (Join-Path $logs "$mode.stderr.log")
 $process.Id | Set-Content -LiteralPath $pidPath
 Write-Output "Started $mode. Diagnostics: $logs"
}
