# Downloads every card image listed in tools\images*.txt into ..\img (skips files already there).
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File fab\tools\fetch-images.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path (Split-Path -Parent $here) 'img'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$urls = Get-ChildItem -Path $here -Filter 'images*.txt' | ForEach-Object { Get-Content $_.FullName } | Where-Object { $_.Trim() -ne '' } | Sort-Object -Unique
$ProgressPreference = 'SilentlyContinue'   # the progress bar makes Invoke-WebRequest very slow
$done = 0; $skipped = 0; $failed = @()
foreach ($u in $urls) {
  $dest = Join-Path $out ([IO.Path]::GetFileName($u))
  if (Test-Path $dest) { $skipped++; continue }
  try { Invoke-WebRequest -Uri $u -OutFile $dest -UseBasicParsing; $done++ }
  catch { $failed += $u; if (Test-Path $dest) { Remove-Item $dest } }
  Start-Sleep -Milliseconds 100   # be polite to LSS's bucket
}
Write-Host "Downloaded $done, already had $skipped, failed $($failed.Count) of $($urls.Count)."
if ($failed.Count) { $failed | ForEach-Object { Write-Host "  failed: $_" } ; exit 1 }
