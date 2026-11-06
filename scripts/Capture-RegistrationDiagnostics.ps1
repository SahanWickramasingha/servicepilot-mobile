[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._:-]+$')][string]$Serial,
    [string]$Adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    [ValidatePattern('^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$')]
    [string]$Package = 'com.sahanwickramasingha.servicepilot',
    [ValidateRange(10, 600)][int]$Seconds = 120,
    [Parameter(Mandatory = $true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\RegistrationDiagnostics.ps1')
if (!(Test-Path -LiteralPath $Adb -PathType Leaf)) { throw 'ADB not found; pass -Adb with the platform-tools adb.exe path.' }
$processIds = @(& $Adb -s $Serial shell pidof -s $Package 2>$null)
if ($LASTEXITCODE -ne 0 -or $processIds.Count -ne 1 -or $processIds[0].Trim() -notmatch '^\d+$') {
    throw 'Open the installed app on the selected device first; no single running app PID was found.'
}
$appProcessId = $processIds[0].Trim()
$target = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $target) { throw 'Use a new output filename for each reproduction; existing evidence will not be overwritten.' }
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
$writer = [IO.StreamWriter]::new($target, $false, [Text.UTF8Encoding]::new($false))
$start = [Diagnostics.ProcessStartInfo]::new()
$start.FileName = [IO.Path]::GetFullPath($Adb)
# Validated serial and numeric PID only. Start at the end of the buffer;
# existing logs from a previous attempt are not evidence for this reproduction.
$start.Arguments = "-s $Serial logcat --pid=$appProcessId -v raw -T 1 ReactNativeJS:V *:S"
$start.UseShellExecute = $false; $start.CreateNoWindow = $true
$start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
$capture = [Diagnostics.Process]::new(); $capture.StartInfo = $start
$count = 0
$started = $false
try {
    if (!$capture.Start()) { throw 'Could not start ADB capture.' }
    $started = $true
    $discardErrors = $capture.StandardError.ReadToEndAsync()
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $nextLine = $capture.StandardOutput.ReadLineAsync()
    Write-Host "Capture running for $Seconds seconds. Reproduce ONE registration or recovery action now. Raw logcat is not saved."
    while ($clock.Elapsed.TotalSeconds -lt $Seconds) {
        if (!$nextLine.Wait(200)) { continue }
        $line = $nextLine.Result
        if ($null -eq $line) { break }
        $safe = ConvertTo-SafeRegistrationEvent -Line $line
        if ($null -ne $safe) {
            $json = ConvertTo-Json -InputObject $safe -Compress
            $writer.WriteLine($json); $writer.Flush(); $count++
            Write-Host $json
        }
        $nextLine = $capture.StandardOutput.ReadLineAsync()
    }
    if ($capture.HasExited -and $capture.ExitCode -ne 0) { Write-Warning 'ADB ended with an error; capture is incomplete. Raw stderr was discarded.' }
} finally {
    if ($started -and !$capture.HasExited) { $capture.Kill(); [void]$capture.WaitForExit(3000) }
    $capture.Dispose(); $writer.Dispose()
}
Write-Host "Saved $count sanitized failure event(s)."
if ($count -eq 0) { Write-Warning 'No parseable event. Do not infer success or a cause: the APK may lack diagnostics, use multiline legacy logs, have restarted, or emit to another sink. Registration remains NOT VERIFIED.' }
