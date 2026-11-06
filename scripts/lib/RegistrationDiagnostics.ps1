function ConvertTo-SafeRegistrationEvent {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Line)
    $marker = '[registration-failure]'
    $offset = $Line.IndexOf($marker, [StringComparison]::Ordinal)
    if ($offset -lt 0) { return $null }
    $body = $Line.Substring($offset + $marker.Length).Trim()
    $event = $null
    try { $event = ConvertFrom-Json -InputObject $body -ErrorAction Stop } catch { }
    # Older APKs may format the console object as a single JS object line.
    # Never save that line: extract only validated stage/code, without context.
    if ($null -eq $event) {
        $stageMatch = [regex]::Match($body, '(?:["'']?stage["'']?\s*:\s*["''])([a-z-]+)["'']')
        $codeMatch = [regex]::Match($body, '(?:["'']?code["'']?\s*:\s*["''])([a-z0-9/-]+)["'']')
        if (!$stageMatch.Success -or !$codeMatch.Success) { return $null }
        $event = @{ stage = $stageMatch.Groups[1].Value; code = $codeMatch.Groups[1].Value }
    }
    $stages = @('auth-create', 'recovery-authentication', 'profile-initialization', 'profile-create',
        'profile-existence-read', 'profile-create-transaction', 'profile-server-confirmation',
        'send-verification', 'registration-cleanup', 'profile-payload-validation', 'profile-existing-validation',
        'verification-check', 'profile-email-verification', 'unknown')
    $codes = @('cancelled', 'unknown', 'invalid-argument', 'deadline-exceeded', 'not-found', 'already-exists',
        'permission-denied', 'resource-exhausted', 'failed-precondition', 'aborted', 'out-of-range',
        'unimplemented', 'internal', 'unavailable', 'data-loss', 'unauthenticated')
    if ($event.stage -isnot [string] -or $stages -cnotcontains $event.stage) { return $null }
    if ($event.code -isnot [string] -or !($codes -ccontains $event.code -or
        $event.code -cmatch '^(auth|firestore|registration)/[a-z][a-z0-9-]{0,63}$')) { return $null }
    $version = 'unknown'; $project = 'unknown'
    if ($event.appVersion -is [string] -and $event.appVersion -cmatch '^\d{1,8}(\.\d{1,8}){0,3}([+-][A-Za-z0-9.-]{1,32})?$') { $version = $event.appVersion }
    if ($event.projectId -is [string] -and $event.projectId -cmatch '^[a-z][a-z0-9-]{4,62}$') { $project = $event.projectId }
    # Reconstruct, never forward the input object or unknown properties.
    return [ordered]@{ stage = $event.stage; code = $event.code; appVersion = $version; projectId = $project }
}
