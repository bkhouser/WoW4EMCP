param([switch]$Enable,[switch]$Disable)
$ErrorActionPreference='Stop'
if ($Enable -eq $Disable) { throw 'Specify exactly one of -Enable or -Disable' }
$startup=[Environment]::GetFolderPath('Startup')
$linkPath=Join-Path $startup 'WoW Character Intelligence.lnk'
if ($Disable) { if(Test-Path -LiteralPath $linkPath){Remove-Item -LiteralPath $linkPath}; Write-Output 'Automatic startup disabled.'; return }
$script=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'Start-Companion.ps1'))
$shell=New-Object -ComObject WScript.Shell
$link=$shell.CreateShortcut($linkPath)
$link.TargetPath=(Get-Command powershell.exe).Source
$link.Arguments='-NoProfile -WindowStyle Hidden -File "'+$script+'"'
$link.WorkingDirectory=Split-Path -Parent $PSScriptRoot
$link.WindowStyle=7
$link.Save()
Write-Output 'Automatic companion startup enabled for this Windows user. Tunnel startup remains separate.'
