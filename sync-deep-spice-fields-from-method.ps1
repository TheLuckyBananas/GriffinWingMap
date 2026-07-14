$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundledPython = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if (Test-Path $bundledPython) {
  $python = $bundledPython
} else {
  $python = "python"
}

& $python "$root\tools\sync_method_spice_fields.py" @args

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "Done. Commit deep-spice-fields.json to GitHub after reviewing the printed coordinates." -ForegroundColor Green
} elseif ($LASTEXITCODE -eq 2) {
  Write-Host ""
  Write-Host "No Deep Desert overlays were found on Method's page. Check whether their page layout changed." -ForegroundColor Yellow
} else {
  exit $LASTEXITCODE
}
