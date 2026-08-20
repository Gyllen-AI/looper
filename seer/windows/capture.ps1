param([string]$Window = '', [switch]$Status, [switch]$Serve, [string]$Exchange = '')

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
        return 'unreachable'
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

$UNREACHABLE = 6
$TOO_OLD = 7

if ($Status) {
    $said = Ask-Consent 'armed?'
    if ($said -eq 'unreachable' -or -not $said) { exit $UNREACHABLE }
    if (-not $said.StartsWith('{')) { exit $TOO_OLD }
    [Console]::Out.Write($said)
    exit 0
}

if (-not $Window -and -not $Serve) { exit $UNAVAILABLE }

if (-not $Serve) {
    $said = Ask-Consent $Window
    if ($said -eq 'unreachable') { exit $UNREACHABLE }
    if ($said -ne 'yes') { exit $DISARMED }
}

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

function Write-Answer([string]$partly, [string]$said, [string]$text) {
    [System.IO.File]::WriteAllText($partly, $text)
    Move-Item -LiteralPath $partly -Destination $said -Force
}

function Grab-Window([string]$title) {
    $process = Get-Process | Where-Object { $_.MainWindowTitle -eq $title } | Select-Object -First 1
    if (-not $process) { return @{ error = $NOT_FOUND } }

    $handle = $process.MainWindowHandle
    $rect = New-Object SeerRect
    if (-not [SeerWin]::GetWindowRect($handle, [ref]$rect)) { return @{ error = $UNAVAILABLE } }

    $width = $rect.R - $rect.L
    $height = $rect.B - $rect.T
    if ($width -le 0 -or $height -le 0) { return @{ error = $UNAVAILABLE } }

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
            label  = $title
            media  = 'image/png'
            base64 = [Convert]::ToBase64String($stream.ToArray())
            state  = $state
        })
        missing = @()
    }
    return @{ answer = $answer }

}

if ($Serve) {
    if (-not $Exchange) { exit $UNAVAILABLE }
    $ask = Join-Path $Exchange 'ask.txt'
    $said = Join-Path $Exchange 'said.json'
    $partly = Join-Path $Exchange 'said.part'
    while ($true) {
        if (Test-Path $ask) {
            $title = ''
            try { $title = [System.IO.File]::ReadAllText($ask, [System.Text.Encoding]::UTF8).Trim() } catch { $title = '' }
            Remove-Item -LiteralPath $ask -Force -ErrorAction SilentlyContinue
            if ($title) {
                $verdict = Ask-Consent $title
                if ($verdict -eq 'unreachable') { exit $UNREACHABLE }
                if ($verdict -ne 'yes') {
                    Write-Answer $partly $said (@{ refused = $DISARMED } | ConvertTo-Json -Compress)
                } else {
                    $got = Grab-Window $title
                    if ($got.ContainsKey('error')) {
                        Write-Answer $partly $said (@{ refused = $got.error } | ConvertTo-Json -Compress)
                    } else {
                        Write-Answer $partly $said ($got.answer | ConvertTo-Json -Depth 5 -Compress)
                    }
                }
            }
        } else {
            if ((Ask-Consent 'armed?') -eq 'unreachable') { exit $UNREACHABLE }
            Start-Sleep -Milliseconds 25
        }
    }
}

$got = Grab-Window $Window
if ($got.ContainsKey('error')) { exit $got.error }
[Console]::Out.Write(($got.answer | ConvertTo-Json -Depth 5 -Compress))
