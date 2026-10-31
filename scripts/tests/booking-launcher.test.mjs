import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';

test('real launcher ADB adapter accepts a successful command with stderr and rejects a nonzero exit', { skip: process.platform !== 'win32' }, () => {
  const child = Buffer.from('[Console]::Error.WriteLine("Warning: Activity not started, delivered to existing activity."); Write-Output "device"; exit 0', 'utf16le').toString('base64');
  const script = `
    $ErrorActionPreference = 'Stop'
    $tokens = $null; $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PWD 'scripts/run-servicepilot-real.ps1'), [ref]$tokens, [ref]$errors)
    $helper = $ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-BookingAdb'}, $true)
    Invoke-Expression $helper.Extent.Text
    $bookingAdb = 'powershell.exe'
    $state = Invoke-BookingAdb -AdbArguments @('-NoProfile','-EncodedCommand', '${child}')
    if ($state -ne 'device') { throw 'Valid device output lost.' }
    $failed = $false
    try { Invoke-BookingAdb -AdbArguments @('-NoProfile','-Command','exit 7') } catch { $failed = $true }
    if (!$failed) { throw 'Nonzero adb status was ignored.' }
    Write-Output 'ADB adapter regression passed'
  `;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ADB adapter regression passed/);
});
