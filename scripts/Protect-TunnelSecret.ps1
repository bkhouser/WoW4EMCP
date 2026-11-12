param([string]$Directory)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
if (!$Directory) { $Directory=Join-Path $PSScriptRoot '../data/secrets' }
$secretRoot=[IO.Path]::GetFullPath($Directory)
$source=Join-Path $secretRoot '.env.tunnel'
$target=Join-Path $secretRoot 'openai-tunnel-runtime.dpapi'
if (Test-Path -LiteralPath $target) { throw 'An encrypted runtime credential already exists; refusing to replace it.' }
$file=Get-Item -LiteralPath $source
if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Secret source must not be a link.' }
$lines=@(Get-Content -LiteralPath $source | Where-Object { $_ -match '^CONTROL_PLANE_API_KEY=' })
if ($lines.Count -ne 1) { throw 'Expected exactly one runtime credential entry.' }
$value=$lines[0].Substring('CONTROL_PLANE_API_KEY='.Length).Trim()
if (!$value.StartsWith('sk-') -or $value.Length -lt 32) { throw 'Runtime credential format invalid.' }
$secure=ConvertTo-SecureString $value -AsPlainText -Force
$secure | ConvertFrom-SecureString | Set-Content -LiteralPath $target -Encoding ASCII
$check=ConvertTo-SecureString ((Get-Content -LiteralPath $target -Raw).Trim())
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($check)
try {
  if ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) -cne $value) { throw 'Encrypted credential verification failed.' }
} finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
Remove-Item -LiteralPath $source
$value=$null;$lines=$null
Write-Output 'Runtime credential encrypted with current-user DPAPI; temporary env file removed.'
