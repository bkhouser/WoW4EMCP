$ErrorActionPreference='Stop'
# Tested release and archive digest are deliberately pinned; upgrades require verification.
$release=Invoke-RestMethod -Uri 'https://api.github.com/repos/openai/tunnel-client/releases/tags/v0.0.20'
$pinnedSha256='99474AAA62ECE303D7B661F2F46F932DCD560B489B540F817355DA25BE71BCF3'
$asset=@($release.assets | Where-Object { $_.name -match '^tunnel-client-v[0-9.]+-windows-amd64\.zip$' })
$checksums=@($release.assets | Where-Object name -eq 'SHA256SUMS.txt')
if ($asset.Count -ne 1 -or $checksums.Count -ne 1) { throw 'Expected one official Windows amd64 artifact and checksum file; inspect release manually.' }
$base=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../tools/tunnel-client'))
New-Item -ItemType Directory -Path $base -Force | Out-Null
foreach($a in @($asset[0],$checksums[0])) {
 if ($a.browser_download_url -notlike 'https://github.com/openai/tunnel-client/releases/download/*') { throw 'Unexpected release download origin' }
 Invoke-WebRequest -Uri $a.browser_download_url -OutFile (Join-Path $base $a.name)
}
$archive=Join-Path $base $asset[0].name
$line=Get-Content -LiteralPath (Join-Path $base 'SHA256SUMS.txt') | Where-Object { $_ -match ('\s+\*?'+[regex]::Escape($asset[0].name)+'$') }
if (@($line).Count -ne 1) { throw 'Artifact missing from checksums' }
$expected=($line -split '\s+')[0]
if ($expected -ine $pinnedSha256 -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ine $pinnedSha256) { throw 'Release checksum mismatch' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
try {
 foreach($entry in $zip.Entries) {
   $destination=[IO.Path]::GetFullPath((Join-Path $base $entry.FullName))
   if (!$destination.StartsWith($base+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe archive member' }
 }
} finally { $zip.Dispose() }
Expand-Archive -LiteralPath $archive -DestinationPath $base -Force
$binary=@(Get-ChildItem -LiteralPath $base -Recurse -Filter 'tunnel-client.exe')
if ($binary.Count -ne 1) { throw 'Expected one tunnel-client.exe' }
& $binary[0].FullName --version
& $binary[0].FullName help quickstart
Write-Output "Checksum verified; client ready at $($binary[0].FullName). No tunnel, key or public listener was created."
