$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$entry=Join-Path $repo 'dist/src/cli.js'
foreach ($mode in @('watch','serve')) {
 $pidPath=Join-Path $repo "data/logs/$mode.pid"
 if (!(Test-Path -LiteralPath $pidPath)) { continue }
 $process=Get-CimInstance Win32_Process -Filter "ProcessId = $([int](Get-Content -LiteralPath $pidPath))" -ErrorAction SilentlyContinue
 if ($process -and $process.Name -eq 'node.exe' -and $process.CommandLine -like "*$entry*$mode*") {
   # Only our own companion process; SQLite transactions protect interrupted imports.
   Stop-Process -Id $process.ProcessId
 }
 Remove-Item -LiteralPath $pidPath
}
