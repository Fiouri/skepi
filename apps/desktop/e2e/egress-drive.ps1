<#
.SYNOPSIS
  Uses the running SKEPI app like a person, through Windows UI Automation (no WebDriver, so the
  WebView2 runs with the app's own browser arguments and data folder): accepts the disclaimer, searches
  and opens an article (sealed viewer window), asks a question (AI on the GPU), opens the map, the
  emergency cards, the library and the settings. Used by apps/desktop/e2e/egress.mjs.
#>
param([Parameter(Mandatory)][int]$AppPid)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
$A = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]

function Get-MainWindow {
  $cond = New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, $AppPid)
  foreach ($w in $A::RootElement.FindAll($Scope::Children, $cond)) { if ($w.Current.Name -eq 'SKEPI') { return $w } }
  return $null
}

function Find-Named([string]$Name, [string]$Type = 'Button', [int]$TimeoutS = 60) {
  $end = (Get-Date).AddSeconds($TimeoutS)
  while ((Get-Date) -lt $end) {
    $win = Get-MainWindow
    if ($win) {
      $ct = New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::$Type)
      foreach ($e in $win.FindAll($Scope::Descendants, $ct)) { if ($e.Current.Name -like $Name) { return $e } }
    }
    Start-Sleep -Milliseconds 500
  }
  throw "not found: $Type '$Name'"
}

function Invoke-Named([string]$Name, [int]$TimeoutS = 60) {
  $e = Find-Named $Name 'Button' $TimeoutS
  ($e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke()
  Write-Host "clicked '$Name'"
}

Add-Type -Namespace SkepiE2e -Name Win -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr hWnd);'

function Send-Text([string]$Field, [string]$Text) {
  $win = Get-MainWindow
  [void][SkepiE2e.Win]::SetForegroundWindow([System.IntPtr]$win.Current.NativeWindowHandle)
  $e = Find-Named $Field 'Edit'
  $e.SetFocus()
  Start-Sleep -Milliseconds 300
  [System.Windows.Forms.SendKeys]::SendWait('^a{DEL}')
  [System.Windows.Forms.SendKeys]::SendWait($Text)
  Start-Sleep -Milliseconds 300
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  Write-Host "typed '$Text' in '$Field'"
}

# Types a query and opens the hit; types again if the first keystrokes went elsewhere.
function Open-Hit([string]$Field, [string]$Text, [string]$Hit) {
  for ($i = 1; $i -le 3; $i++) {
    Send-Text $Field $Text
    try { Invoke-Named $Hit 15; return } catch { Write-Host "retry ${i}: $($_.Exception.Message)" }
  }
  throw "not found after 3 tries: $Hit"
}

Invoke-Named 'I understand, continue' 600
Invoke-Named 'Search'
Open-Hit 'Search articles, places and cards' 'Canberra' 'Canberra*'
Start-Sleep -Seconds 8   # sealed viewer window open
Invoke-Named 'Ask'
Send-Text 'Ask something*' 'What is the capital of Australia?'
Start-Sleep -Seconds 30  # Layer 1, model load, AI summary
Invoke-Named 'Map'
Start-Sleep -Seconds 15
Invoke-Named 'Search'
Send-Text 'Search articles, places and cards' 'Patras'
Start-Sleep -Seconds 8
Invoke-Named 'Emergency cards'
Start-Sleep -Seconds 5
Invoke-Named 'Library'
Start-Sleep -Seconds 5
Invoke-Named 'Settings'
Start-Sleep -Seconds 5
Write-Host 'drive done'
