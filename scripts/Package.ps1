$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
& node.exe (Join-Path $PSScriptRoot 'Check-Publication.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Publication checks failed' }
$version=(Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') { throw 'Invalid release version' }
$release=Join-Path $repo "artifacts/wow-character-intelligence-$version"
if (Test-Path -LiteralPath $release) { throw 'Release staging already exists; choose a new version or explicitly remove the old staging directory.' }
New-Item -ItemType Directory -Path $release -Force | Out-Null
# Only tracked source files are eligible; untracked files nested in source folders are excluded.
$tracked=@(& git -C $repo ls-files)
if ($LASTEXITCODE -ne 0) { throw 'Unable to enumerate tracked release source' }
$rootFiles=@('package.json','package-lock.json','tsconfig.json','plugin.json','mcp.json','README.md','LICENSE','SECURITY.md','THIRD_PARTY_NOTICES.md','CONTRIBUTING.md','config.example.json','config.sample.json','.gitignore','.gitattributes')
function CopyReleaseFile([string]$relative) {
 $source=[IO.Path]::GetFullPath((Join-Path $repo $relative))
 if (!$source.StartsWith($repo+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Release path escaped source root' }
 if ((Get-Item -LiteralPath $source).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Release files must not be links' }
 $destination=Join-Path $release $relative
 New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
 Copy-Item -LiteralPath $source -Destination $destination
}
foreach ($name in $tracked) {
 if ($name -match '^(src|tests|addon|scripts|docs|skills)/' -or $name -in $rootFiles) { CopyReleaseFile $name }
 # Include only compiler outputs corresponding to a tracked TypeScript source.
 if ($name -match '^(src|tests)/.*\.ts$') {
   $compiled='dist/'+($name -replace '\.ts$','.js')
   CopyReleaseFile $compiled
   CopyReleaseFile ($compiled+'.map')
 }
}
Copy-Item -LiteralPath (Join-Path $repo 'config.example.json') -Destination (Join-Path $release 'config.local.json')
$archive=Join-Path $repo "artifacts/wow-character-intelligence-$version.zip"
Compress-Archive -LiteralPath $release -DestinationPath $archive
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
try {
 $names=@($zip.Entries | ForEach-Object { $_.FullName.Replace('\','/') })
 if ($names -match '(^|/)(data|node_modules|\.npm-cache|tools|\.git)/' -or $names -match '(^|/)\.env|\.dpapi$|\.sqlite|\.log$') { throw 'Private data or dependencies leaked into archive' }
 $configEntry=@($zip.Entries | Where-Object { $_.FullName.Replace('\','/') -match '/config\.local\.json$' })
 if ($configEntry.Count -ne 1) { throw 'Expected exactly one generated empty local configuration' }
 $reader=[IO.StreamReader]::new($configEntry[0].Open())
 try { $generated=$reader.ReadToEnd() } finally { $reader.Dispose() }
 if ($generated -cne (Get-Content -LiteralPath (Join-Path $repo 'config.example.json') -Raw)) { throw 'Local configuration differs from empty public template' }
 foreach ($required in @('plugin.json','mcp.json','dist/src/cli.js','scripts/Initialize.ps1')) { if(!($names -match ([regex]::Escape($required)+'$'))) { throw "Missing $required" } }
 Write-Output "Verified source/runtime archive: $archive ($($zip.Entries.Count) entries). Run Initialize.ps1 after extraction; dependencies are not bundled."
} finally { $zip.Dispose() }
Get-FileHash -LiteralPath $archive -Algorithm SHA256 | Select-Object Hash,Path
