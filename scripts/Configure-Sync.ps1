param([ValidateSet('reload','screen','both','off')][string]$Mode,[string]$SourceId,[string]$ExecutablePath,[string]$ConfigPath)

function Read-SyncConfigText([string]$Path) {
 $utf8=[Text.UTF8Encoding]::new($false,$true)
 return $utf8.GetString([IO.File]::ReadAllBytes($Path))
}

function ConvertFrom-SyncConfigText([string]$Text) {
 if ($Text.StartsWith([string][char]0xFEFF,[StringComparison]::Ordinal)) { $Text=$Text.Substring(1) }
 if (!$Text.TrimStart().StartsWith('{',[StringComparison]::Ordinal)) { throw 'Expected a JSON object for the companion configuration' }
 return ConvertFrom-Json -InputObject $Text -ErrorAction Stop
}

function Test-SyncAddonSource($Source) {
 return $Source.format -ceq 'addon' -and $Source.id -is [string] -and $Source.id -and
  $Source.expectedPlayerName -is [string] -and $Source.expectedPlayerName -and
  $Source.expectedRealm -is [string] -and $Source.expectedRealm
}

function Save-SyncConfig {
 param([string]$Path,[string]$ExpectedText,[ValidateSet('reload','screen','both','off')][string]$Mode,[string]$SourceId,[string]$ExecutablePath)
 $ErrorActionPreference='Stop'
 $Path=[IO.Path]::GetFullPath($Path)
 $changed='Companion configuration changed since it was read. Reopen sync settings and try again.'
 $latest=Read-SyncConfigText $Path
 if (![string]::Equals($latest,$ExpectedText,[StringComparison]::Ordinal)) { throw $changed }
 $config=ConvertFrom-SyncConfigText $latest
 $enabled=$Mode -in @('screen','both')
 if ($enabled) {
  if ($config.mode -cne 'real') { throw 'Screen capture is available only for the real store' }
  $matches=@($config.sources | Where-Object { $_.id -ceq $SourceId })
  if ($matches.Count -ne 1 -or !(Test-SyncAddonSource $matches[0])) { throw 'Choose one explicitly authorized addon source with expected player and realm' }
  if (!$ExecutablePath -or !(Test-Path -LiteralPath $ExecutablePath -PathType Leaf) -or [IO.Path]::GetExtension($ExecutablePath) -ine '.exe') { throw 'Choose the actual WoW executable' }
  $ExecutablePath=[IO.Path]::GetFullPath($ExecutablePath)
 }
 $config | Add-Member -NotePropertyName savedVariablesEnabled -NotePropertyValue ($Mode -in @('reload','both')) -Force
 $config | Add-Member -NotePropertyName optical -NotePropertyValue ([ordered]@{enabled=$enabled;sourceId=$(if($SourceId){$SourceId}else{$null});executablePath=$(if($ExecutablePath){$ExecutablePath}else{$null})}) -Force

 $sha256=[Security.Cryptography.SHA256]::Create()
 try { $key=[BitConverter]::ToString($sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($Path.ToUpperInvariant()))) }
 finally { $sha256.Dispose() }
 $mutex=[Threading.Mutex]::new($false,('WCI.ConfigureSync.'+$key))
 $locked=$false
 $temporary=$Path+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
 try {
  [IO.File]::WriteAllText($temporary,($config | ConvertTo-Json -Depth 30),[Text.UTF8Encoding]::new($false))
  try { $locked=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked=$true }
  if (!$locked) { throw 'Another sync settings save is in progress. Reopen sync settings and try again.' }
  if (![string]::Equals((Read-SyncConfigText $Path),$latest,[StringComparison]::Ordinal)) { throw $changed }
  # The mutex coordinates this script's writers for this path in the current session.
  # File.Replace atomically swaps the files. An external editor can still write between the final comparison and the swap.
  [IO.File]::Replace($temporary,$Path,[NullString]::Value)
 } finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
  [IO.File]::Delete($temporary)
 }
}

if ($MyInvocation.InvocationName -eq '.') { return }
$ErrorActionPreference='Stop'
if (!$ConfigPath) { $ConfigPath=Join-Path $PSScriptRoot '../config.local.json' }
$path=[IO.Path]::GetFullPath($ConfigPath)
$original=Read-SyncConfigText $path
$config=ConvertFrom-SyncConfigText $original
$sources=@($config.sources | Where-Object { Test-SyncAddonSource $_ })
if (!$SourceId -and $config.optical) { $SourceId=$config.optical.sourceId }
if (!$SourceId -and $sources.Count -eq 1) { $SourceId=$sources[0].id }
if (!$ExecutablePath -and $config.optical) { $ExecutablePath=$config.optical.executablePath }
if (!$Mode) {
 Add-Type -AssemblyName System.Windows.Forms
 Add-Type -AssemblyName System.Drawing
 $form=New-Object Windows.Forms.Form
 $form.Text='WoW Character Intelligence - Sync modes';$form.ClientSize=New-Object Drawing.Size(560,320);$form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
 function LabelAt($text,$y) { $label=New-Object Windows.Forms.Label;$label.Text=$text;$label.Location=New-Object Drawing.Point(16,$y);$label.Size=New-Object Drawing.Size(525,35);$form.Controls.Add($label) }
 LabelAt 'Choose the transports the Windows companion may use:' 15
 $modes=New-Object Windows.Forms.ComboBox;$modes.DropDownStyle='DropDownList';$modes.Location=New-Object Drawing.Point(16,45);$modes.Width=520
 @('reload','screen','both','off') | ForEach-Object { [void]$modes.Items.Add($_) }
 $saved=if($null -eq $config.savedVariablesEnabled){$true}else{[bool]$config.savedVariablesEnabled}
 $screen=$config.optical -and $config.optical.enabled
 $modes.SelectedItem=if($saved -and $screen){'both'}elseif($screen){'screen'}elseif($saved){'reload'}else{'off'};$form.Controls.Add($modes)
 LabelAt 'Screen mode: authorized addon source' 82
 $sourceChoice=New-Object Windows.Forms.ComboBox;$sourceChoice.DropDownStyle='DropDownList';$sourceChoice.Location=New-Object Drawing.Point(16,108);$sourceChoice.Width=520
 $sources | ForEach-Object { [void]$sourceChoice.Items.Add($_.id) };if($SourceId){$sourceChoice.SelectedItem=$SourceId};$form.Controls.Add($sourceChoice)
 LabelAt 'Screen mode: exact WoW executable path (foreground window only)' 143
 $exe=New-Object Windows.Forms.TextBox;$exe.Location=New-Object Drawing.Point(16,170);$exe.Width=430;$exe.Text=$ExecutablePath;$form.Controls.Add($exe)
 $browse=New-Object Windows.Forms.Button;$browse.Text='Browse';$browse.Location=New-Object Drawing.Point(455,167);$browse.Add_Click({$dialog=New-Object Windows.Forms.OpenFileDialog;$dialog.Filter='WoW executable (*.exe)|*.exe';if($dialog.ShowDialog() -eq 'OK'){$exe.Text=$dialog.FileName};$dialog.Dispose()});$form.Controls.Add($browse)
 LabelAt 'Also select the matching modes with /wci options in WoW. Screen capture is experimental; no game inputs are sent. Reload is the default.' 210
 $apply=New-Object Windows.Forms.Button;$apply.Text='Save';$apply.Location=New-Object Drawing.Point(450,270);$apply.DialogResult='OK';$form.Controls.Add($apply);$form.AcceptButton=$apply
 if($form.ShowDialog() -ne 'OK'){$form.Dispose();return}
 $Mode=[string]$modes.SelectedItem;$SourceId=[string]$sourceChoice.SelectedItem;$ExecutablePath=$exe.Text;$form.Dispose()
}
Save-SyncConfig -Path $path -ExpectedText $original -Mode $Mode -SourceId $SourceId -ExecutablePath $ExecutablePath
Write-Output "Windows sync mode: $Mode. The running companion picks this up automatically. In WoW use /wci mode $Mode (or /wci options). After this upgrade, fully exit and relaunch WoW once to load the new addon file/settings declaration."
