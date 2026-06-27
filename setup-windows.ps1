Write-Host "Cleaning old incomplete install from this project..."
Remove-Item -Recurse -Force .\node_modules -ErrorAction SilentlyContinue
Remove-Item -Force .\package-lock.json -ErrorAction SilentlyContinue

Write-Host "Cleaning broken Puppeteer Chrome cache..."
Remove-Item -Recurse -Force "$env:USERPROFILE\.cache\puppeteer" -ErrorAction SilentlyContinue

Write-Host "Telling Puppeteer NOT to download Chrome..."
$env:PUPPETEER_SKIP_DOWNLOAD="true"
$env:PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true"
$env:PUPPETEER_PRODUCT="chrome"

Write-Host "Installing packages without install scripts, so Puppeteer download is skipped..."
npm.cmd install --ignore-scripts
if ($LASTEXITCODE -ne 0) {
  Write-Host "Install failed. Move this folder to C:\whatsapp-automation-free-demo-final and run setup-windows.cmd again."
  exit $LASTEXITCODE
}

Write-Host "Setup complete. Starting project now..."
npm.cmd start
