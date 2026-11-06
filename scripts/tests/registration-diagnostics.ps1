$ErrorActionPreference = 'Stop'
foreach ($path in @('..\Capture-RegistrationDiagnostics.ps1', '..\lib\RegistrationDiagnostics.ps1')) {
    $parseTokens = $null; $parseErrors = $null
    [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $path), [ref]$parseTokens, [ref]$parseErrors)
    if ($parseErrors.Count) { throw 'Capture/parser script failed PowerShell syntax validation' }
}
$guide = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '..\APK_REGISTRATION_CAPTURE.md'))
foreach ($block in [regex]::Matches($guide, '(?s)```powershell\r?\n(.*?)```')) {
    $parseTokens = $null; $parseErrors = $null
    [void][Management.Automation.Language.Parser]::ParseInput($block.Groups[1].Value, [ref]$parseTokens, [ref]$parseErrors)
    if ($parseErrors.Count) { throw 'Documented PowerShell commands failed syntax validation' }
}
. (Join-Path $PSScriptRoot '..\lib\RegistrationDiagnostics.ps1')
$event = ConvertTo-SafeRegistrationEvent 'W/ReactNativeJS: [registration-failure] {"stage":"profile-create-transaction","code":"permission-denied","appVersion":"1.0.0","projectId":"servicepilot-756d9","password":"secret","profile":{"email":"private@example.test"}}'
if (($event.Keys -join ',') -cne 'stage,code,appVersion,projectId' -or $event.stage -cne 'profile-create-transaction' -or $event.projectId -cne 'servicepilot-756d9') { throw 'JSON allowlist failed' }
if ((ConvertTo-Json $event -Compress) -match 'secret|private@example') { throw 'Personal data leaked' }
$legacy = ConvertTo-SafeRegistrationEvent "[registration-failure] { stage: 'recovery-authentication', code: 'auth/invalid-credential', email: 'private@example.test' }"
if ($legacy.code -cne 'auth/invalid-credential' -or $legacy.projectId -cne 'unknown') { throw 'Legacy extraction failed' }
foreach ($line in @('[registration-debug] {"password":"secret"}', '[registration-failure] {"stage":"private","code":"permission-denied"}', '[registration-failure] {"stage":"auth-create","code":"secret-token"}', '[registration-failure] {', 'unrelated raw token')) {
    if ($null -ne (ConvertTo-SafeRegistrationEvent $line)) { throw 'Unsafe or incomplete event accepted' }
}
$metadata = ConvertTo-SafeRegistrationEvent '[registration-failure] {"stage":"auth-create","code":"auth/email-already-in-use","appVersion":"private@example.test","projectId":"private@example.test"}'
if ($metadata.appVersion -cne 'unknown' -or $metadata.projectId -cne 'unknown') { throw 'Unsafe context accepted' }
Write-Host 'PASS: script/guide PowerShell syntax, JSON allowlist, legacy extraction, secret omission, malformed events and metadata validation.'
