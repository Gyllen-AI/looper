$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$state = [hashtable]::Synchronized(@{ Armed = New-Object System.Collections.Generic.List[string] })

$pipe = [powershell]::Create()
$runspace = [runspacefactory]::CreateRunspace()
$runspace.Open()
$runspace.SessionStateProxy.SetVariable('state', $state)
$pipe.Runspace = $runspace
[void]$pipe.AddScript({
    $ErrorActionPreference = 'Continue'
    while ($true) {
      try {
        $server = New-Object System.IO.Pipes.NamedPipeServerStream(
            'looper-seer', [System.IO.Pipes.PipeDirection]::InOut, 1)
        $server.WaitForConnection()
        try {
            $reader = New-Object System.IO.StreamReader($server)
            $writer = New-Object System.IO.StreamWriter($server)
            $asked = $reader.ReadLine()
            if ($asked -eq 'armed?') {
                $open = @(Get-Process |
                    Where-Object { $_.MainWindowTitle -ne '' } |
                    ForEach-Object { $_.MainWindowTitle } |
                    Sort-Object -Unique)
                $answer = @{ armed = @($state.Armed); open = $open } |
                    ConvertTo-Json -Depth 3 -Compress
            } else {
                $answer = 'no'
                if ($asked -and $state.Armed.Contains($asked)) { $answer = 'yes' }
            }
            $writer.WriteLine($answer)
            $writer.Flush()
        } finally {
            $server.Dispose()
        }
      } catch {
        Start-Sleep -Milliseconds 200
      }
    }
})
[void]$pipe.BeginInvoke()

$form = New-Object System.Windows.Forms.Form
$form.Text = 'looper seer - what may be looked at'
$form.Size = New-Object System.Drawing.Size(620, 460)
$form.TopMost = $true

$list = New-Object System.Windows.Forms.CheckedListBox
$list.CheckOnClick = $true
$list.IntegralHeight = $false
$list.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$said = New-Object System.Windows.Forms.Label
$said.Text = 'Tick a window and the agent may look at it. Untick it and the agent may not. Close this window and it can see nothing at all.'
$said.Dock = 'Top'
$said.Height = 56
$said.Padding = New-Object System.Windows.Forms.Padding(8, 8, 8, 8)
$said.Font = New-Object System.Drawing.Font('Segoe UI', 9)

$armedSaid = New-Object System.Windows.Forms.Label
$armedSaid.Dock = 'Bottom'
$armedSaid.Height = 44
$armedSaid.AutoEllipsis = $true
$armedSaid.Padding = New-Object System.Windows.Forms.Padding(8, 6, 8, 0)
$armedSaid.Font = New-Object System.Drawing.Font('Segoe UI', 9)

$disarm = New-Object System.Windows.Forms.Button
$disarm.Text = 'Disarm everything'
$disarm.Dock = 'Bottom'
$disarm.Height = 34

$holder = New-Object System.Windows.Forms.Panel
$holder.Dock = 'Fill'
$holder.Padding = New-Object System.Windows.Forms.Padding(8, 0, 8, 4)
$list.Dock = 'Fill'
$holder.Controls.Add($list)

$form.Controls.Add($holder)
$form.Controls.Add($armedSaid)
$form.Controls.Add($disarm)
$form.Controls.Add($said)

function Show-Armed {
    if ($state.Armed.Count -eq 0) {
        $armedSaid.Text = 'Armed: nothing. Every request is refused.'
        $armedSaid.ForeColor = [System.Drawing.Color]::DimGray
        return
    }
    $armedSaid.Text = ('Armed (' + $state.Armed.Count + '): ') + ($state.Armed -join ' | ')
    $armedSaid.ForeColor = [System.Drawing.Color]::FromArgb(180, 60, 0)
}

$onCheck = {
    param($sender, $event)
    $title = [string]$list.Items[$event.Index]
    if ($event.NewValue -eq [System.Windows.Forms.CheckState]::Checked) {
        if (-not $state.Armed.Contains($title)) { [void]$state.Armed.Add($title) }
    } else {
        [void]$state.Armed.Remove($title)
    }
    $form.BeginInvoke([Action]{ Show-Armed }) | Out-Null
}
$list.Add_ItemCheck($onCheck)

$shown = ''
$refresh = {
    $titles = @(Get-Process |
        Where-Object { $_.MainWindowTitle -ne '' } |
        ForEach-Object { $_.MainWindowTitle } |
        Sort-Object -Unique)
    $now = $titles -join "`n"
    if ($now -eq $script:shown) { return }
    $script:shown = $now

    $list.Remove_ItemCheck($onCheck)
    $list.BeginUpdate()
    $list.Items.Clear()
    foreach ($title in $titles) {
        $at = $list.Items.Add($title)
        if ($state.Armed.Contains($title)) { $list.SetItemChecked($at, $true) }
    }
    $list.EndUpdate()
    $list.Add_ItemCheck($onCheck)
    Show-Armed
}

$disarm.Add_Click({
    $state.Armed.Clear()
    $list.Remove_ItemCheck($onCheck)
    for ($at = 0; $at -lt $list.Items.Count; $at += 1) { $list.SetItemChecked($at, $false) }
    $list.Add_ItemCheck($onCheck)
    Show-Armed
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000
$timer.Add_Tick($refresh)
$timer.Start()
& $refresh
Show-Armed

$form.Add_FormClosing({ $state.Armed.Clear() })
[void]$form.ShowDialog()
$pipe.Stop()
