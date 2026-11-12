param([ValidateSet('reload','screen','both','off')][string]$Mode,[string]$SourceId,[string]$ExecutablePath,[string]$ConfigPath)
$ErrorActionPreference='Stop'
if (!$ConfigPath) { $ConfigPath=Join-Path $PSScriptRoot '../config.local.json' }
$path=[IO.Path]::GetFullPath($ConfigPath)
$config=Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
$sources=@($config.sources | Where-Object { $_.format -eq 'addon' -and $_.expectedPlayerName -and $_.expectedRealm })
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
$enabled=$Mode -in @('screen','both')
if ($enabled) {
 if ($config.mode -ne 'real') { throw 'Screen capture is available only for the real store' }
 if (@($sources | Where-Object id -eq $SourceId).Count -ne 1) { throw 'Choose one explicitly authorized addon source with expected player and realm' }
 if (!$ExecutablePath -or !(Test-Path -LiteralPath $ExecutablePath -PathType Leaf) -or [IO.Path]::GetExtension($ExecutablePath) -ine '.exe') { throw 'Choose the actual WoW executable' }
 $ExecutablePath=[IO.Path]::GetFullPath($ExecutablePath)
}
$config | Add-Member -NotePropertyName savedVariablesEnabled -NotePropertyValue ($Mode -in @('reload','both')) -Force
$config | Add-Member -NotePropertyName optical -NotePropertyValue ([ordered]@{enabled=$enabled;sourceId=$(if($SourceId){$SourceId}else{$null});executablePath=$(if($ExecutablePath){$ExecutablePath}else{$null})}) -Force
$temporary=$path+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
try {
 [IO.File]::WriteAllText($temporary,($config | ConvertTo-Json -Depth 30),[Text.UTF8Encoding]::new($false))
 Move-Item -LiteralPath $temporary -Destination $path -Force
} finally { if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary} }
Write-Output "Windows sync mode: $Mode. The running companion picks this up automatically. In WoW use /wci mode $Mode (or /wci options). After this upgrade, fully exit and relaunch WoW once to load the new addon file/settings declaration."
