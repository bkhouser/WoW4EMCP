param([string]$ClientPath)
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'Stop-Companion.ps1')
& (Join-Path $PSScriptRoot 'Set-Startup.ps1') -Disable
if ($ClientPath) {
  $client=[IO.Path]::GetFullPath($ClientPath)
  $base=[IO.Path]::GetFullPath((Join-Path $client 'Interface/AddOns'))
  $target=[IO.Path]::GetFullPath((Join-Path $base 'WoWCharacterIntelligence'))
  if (!(Test-Path -LiteralPath $base -PathType Container) -or !( $target.StartsWith($base+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase))) { throw 'Unsafe addon target' }
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse }
}
Write-Output 'Runtime/startup removed. Local database, secrets, backups and game SavedVariables are retained. Use the documented explicit deletion procedure if desired.'
