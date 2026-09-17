$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$midiDir = Join-Path $root 'midi'
New-Item -ItemType Directory -Force -Path $midiDir | Out-Null

$files = @(Get-ChildItem -LiteralPath $midiDir -File | Where-Object { $_.Extension -match '^\.(mid|midi)$' } | Sort-Object Name)
$items = @()

foreach ($f in $files) {
    $title = [IO.Path]::GetFileNameWithoutExtension($f.Name) -replace '[_-]+',' '
    $title = ($title -replace '\s+',' ').Trim()
    $bytes = [IO.File]::ReadAllBytes($f.FullName)
    $items += [PSCustomObject]@{
        file  = $f.Name
        title = $title
        data  = [Convert]::ToBase64String($bytes)
    }
}

$generatedAt = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK')
$jsonItems = @($items | ForEach-Object { [PSCustomObject]@{ file=$_.file; title=$_.title } })
$jsonObject = [PSCustomObject]@{ generatedAt=$generatedAt; files=$jsonItems }
$embeddedObject = [PSCustomObject]@{ generatedAt=$generatedAt; files=$items }

$json = $jsonObject | ConvertTo-Json -Depth 5
$embedded = $embeddedObject | ConvertTo-Json -Depth 6 -Compress
$utf8 = New-Object Text.UTF8Encoding($false)

[IO.File]::WriteAllText((Join-Path $midiDir 'library.json'), $json + [Environment]::NewLine, $utf8)
[IO.File]::WriteAllText((Join-Path $midiDir 'library.js'), 'window.WAVE_MIDI_LIBRARY = ' + $embedded + ';' + [Environment]::NewLine, $utf8)

Write-Host ''
Write-Host 'WAVE - Libreria MIDI aggiornata' -ForegroundColor Cyan
Write-Host ('Cartella: ' + $midiDir)
Write-Host ('File MIDI trovati: ' + $files.Count) -ForegroundColor Green
if ($files.Count -eq 0) {
    Write-Host 'ATTENZIONE: nessun file .mid/.midi trovato.' -ForegroundColor Yellow
} else {
    foreach ($f in $files) { Write-Host ('  - ' + $f.Name) }
}
Write-Host ('Generata: ' + $generatedAt)
