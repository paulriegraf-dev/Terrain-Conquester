# Fraktionslauf auf dem eigenen Rechner (Windows PowerShell), alle sechs Paarungen parallel.
#   powershell -ExecutionPolicy Bypass -File scripts\simulation.ps1 -Name basis -Partien 52
# Abgebrochen? Einfach noch einmal starten – jede Paarung macht dort weiter, wo sie aufgehört hat.
# Danach:  npx tsx scripts/fraktionsauswertung.ts basis   und   npx tsx scripts/schadensauswertung.ts basis
param(
  [string]$Name = "basis",
  [int]$Partien = 52,
  [int]$Parallel = 6
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force -Path "auswertung\daten" | Out-Null
$jobs = @()
foreach ($p in 0..5) {
  while (@($jobs | Where-Object { $_.State -eq 'Running' }).Count -ge $Parallel) { Start-Sleep -Seconds 5 }
  $dir = (Get-Location).Path
  $jobs += Start-Job -Name "Paarung $p" -ScriptBlock {
    param($dir, $name, $pair, $n)
    Set-Location $dir
    npx tsx scripts/fraktionslauf.ts run $name $pair $n 2>&1 | Out-File -Encoding utf8 "auswertung\daten\log-$name-$pair.txt"
  } -ArgumentList $dir, $Name, $p, $Partien
  Write-Host "Paarung $p gestartet"
}
Write-Host "Läuft … Fortschritt: Get-Content auswertung\daten\log-$Name-0.txt -Tail 3"
$jobs | Wait-Job | Out-Null
Write-Host "Fertig. Auswertung:"
npx tsx scripts/fraktionsauswertung.ts $Name
npx tsx scripts/schadensauswertung.ts $Name
