param(
 [Parameter(Mandatory)][string]$ClientPath,
 [Parameter(Mandatory)][string]$CharacterName,
 [Parameter(Mandatory)][string]$DisplayName,
 [Parameter(Mandatory)][string]$Slug,
 [Parameter(Mandatory)][string]$Scope,
 [Parameter(Mandatory)][string]$ObservedRealm,
 [ValidateSet('forever','retail','classic-era','mists-classic')][string]$GameVersion='forever',
 [ValidateSet('us','eu','kr','tw')][string]$Region='us',
 [int]$InterfaceVersion=16001,
 [switch]$ReplaceExisting
)
$ErrorActionPreference='Stop'
$client=[IO.Path]::GetFullPath($ClientPath)
if (!(Test-Path -LiteralPath (Join-Path $client 'Interface/AddOns') -PathType Container)) { throw 'Select a verified WoW client folder containing Interface/AddOns' }
if ($GameVersion -ne 'forever' -and $InterfaceVersion -eq 16001) { throw 'Supply the actual InterfaceVersion for this client; cross-client addon testing is still required' }
$target=Join-Path $client 'Interface/AddOns/WoWCharacterIntelligence'
if ((Test-Path -LiteralPath $target) -and !$ReplaceExisting) { throw 'Addon already exists. Back it up and use -ReplaceExisting for an intentional upgrade.' }
if (Test-Path -LiteralPath $target) {
  $backup=Join-Path $PSScriptRoot ('../artifacts/addon-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Path $backup -Force | Out-Null
  Copy-Item -LiteralPath $target -Destination $backup -Recurse
}
function LuaString([string]$value) {
  if ($value -match '[\x00-\x1f]') { throw 'Control characters are not valid identity values' }
  return '"'+$value.Replace('\','\\').Replace('"','\"')+'"'
}
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../addon/WoWCharacterIntelligence/Collector.lua') -Destination $target
$toc=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../addon/WoWCharacterIntelligence/WoWCharacterIntelligence.toc') -Raw
$toc=$toc.Replace('## Interface: 16001',"## Interface: $InterfaceVersion")
[IO.File]::WriteAllText((Join-Path $target 'WoWCharacterIntelligence.toc'),$toc,[Text.UTF8Encoding]::new($false))
$identity='WoWCIIdentities = {{playerName='+ (LuaString $CharacterName)+',realm='+(LuaString $ObservedRealm)+',identity={gameVersion='+(LuaString $GameVersion)+',region='+(LuaString $Region)+',scope='+(LuaString $Scope)+',slug='+(LuaString $Slug)+',name='+(LuaString $DisplayName)+'}}}'
[IO.File]::WriteAllText((Join-Path $target 'Identity.lua'),$identity,[Text.UTF8Encoding]::new($false))
Write-Output "Installed addon at $target. Enable it at character selection or reload. /wci status shows matching/coverage; /wci capture then /reload persists a snapshot."
