param([Parameter(Mandatory = $true)][string]$Window)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

$DISARMED = 5
$NOT_FOUND = 3
$UNAVAILABLE = 4

function Ask-Consent([string]$title) {
    $client = New-Object System.IO.Pipes.NamedPipeClientStream('.', 'looper-seer', [System.IO.Pipes.PipeDirection]::InOut)
    try {
        $client.Connect(2000)
    } catch {
        return 'no'
    }
    try {
        $writer = New-Object System.IO.StreamWriter($client)
        $reader = New-Object System.IO.StreamReader($client)
        $writer.WriteLine($title)
        $writer.Flush()
        $said = $reader.ReadLine()
        if ($null -eq $said) { return 'no' }
        return $said.Trim()
    } finally {
        $client.Dispose()
    }
}

if ((Ask-Consent $Window) -ne 'yes') { exit $DISARMED }

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SeerWin {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out SeerRect r);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
}
[StructLayout(LayoutKind.Sequential)] public struct SeerRect { public int L, T, R, B; }
"@

$process = Get-Process | Where-Object { $_.MainWindowTitle -eq $Window } | Select-Object -First 1
if (-not $process) { exit $NOT_FOUND }

$handle = $process.MainWindowHandle
$rect = New-Object SeerRect
if (-not [SeerWin]::GetWindowRect($handle, [ref]$rect)) { exit $UNAVAILABLE }

$width = $rect.R - $rect.L
$height = $rect.B - $rect.T
if ($width -le 0 -or $height -le 0) { exit $UNAVAILABLE }

$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$dc = $graphics.GetHdc()
[void][SeerWin]::PrintWindow($handle, $dc, 2)
$graphics.ReleaseHdc($dc)

$state = 'rendering'
if ([SeerWin]::IsIconic($handle)) { $state = 'minimised' }
else {
    $first = $bitmap.GetPixel(0, 0)
    $same = $true
    for ($x = 0; $x -lt $width -and $same; $x += 17) {
        for ($y = 0; $y -lt $height -and $same; $y += 17) {
            if ($bitmap.GetPixel($x, $y) -ne $first) { $same = $false }
        }
    }
    if ($same) { $state = 'blank' }
}

$stream = New-Object System.IO.MemoryStream
$bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
$answer = @{
    images  = @(@{
        label  = $Window
        media  = 'image/png'
        base64 = [Convert]::ToBase64String($stream.ToArray())
        state  = $state
    })
    missing = @()
}
[Console]::Out.Write(($answer | ConvertTo-Json -Depth 5 -Compress))
