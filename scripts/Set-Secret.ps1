param([Parameter(Mandatory)][string]$Name,[string]$Directory,[switch]$Generate)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
if (!$Directory) { $Directory=Join-Path $PSScriptRoot '../data/secrets' }
if ($Name -notmatch '^[a-zA-Z0-9_-]{1,80}$') { throw 'Invalid secret name' }
$directoryPath=[IO.Path]::GetFullPath($Directory)
New-Item -ItemType Directory -Path $directoryPath -Force | Out-Null
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $directoryPath '/inheritance:r' '/grant:r' "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict secret directory ACL' }
if ($Generate) {
  $bytes=New-Object byte[] 48
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes); $rng.Dispose()
  $secure=ConvertTo-SecureString ([Convert]::ToBase64String($bytes)) -AsPlainText -Force
} else { $secure=Read-Host "Enter $Name (hidden; never paste into chat)" -AsSecureString }
if ($secure.Length -lt 1) { throw 'Secret cannot be empty' }
$secure | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $directoryPath "$Name.dpapi") -Encoding ASCII
Write-Output "Stored $Name using current-user Windows DPAPI. Value was not printed."
