param([Parameter(Mandatory)][string]$Name,[Parameter(Mandatory)][string]$Directory)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
if ($Name -notmatch '^[a-zA-Z0-9_-]{1,80}$') { throw 'Invalid secret name' }
$encrypted=(Get-Content -LiteralPath (Join-Path $Directory "$Name.dpapi") -Raw).Trim()
$secure=ConvertTo-SecureString $encrypted
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { Write-Output ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
