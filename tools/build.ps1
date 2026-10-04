<#
  Patch Notes - bundler.

  There is no Node, no npm and no build pipeline here on purpose. This
  script concatenates the source files in dependency order and inlines
  them (plus the CSS) into a single self-contained HTML file that runs
  from file:// with no server.

  Usage:   powershell -ExecutionPolicy Bypass -File tools\build.ps1
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# Dependency order matters: each file registers onto the PN namespace.
$sources = @(
  'src\core\ns.js',
  'src\core\store.js',
  'src\data\taxonomy.js',
  'src\data\primitives.js',
  'src\design\stats.js',
  'src\design\items.js',
  'src\design\currency.js',
  'src\design\infra.js',
  'src\design\abilities.js',
  'src\design\talents.js',
  'src\design\races.js',
  'src\design\crafting.js',
  'src\design\market.js',
  'src\design\scrolls.js',
  'src\design\builds.js',
  'src\design\pvp.js',
  'src\design\world.js',
  'src\design\schema.js',
  'src\design\research.js',
  'src\design\events.js',
  'src\design\goals.js',
  'src\design\novelty.js',
  'src\sim\combat.js',
  'src\design\metrics.js',
  'src\design\coherence.js',
  'src\design\axes.js',
  'src\sim\state.js',
  'src\sim\titles.js',
  'src\sim\diff.js',
  'src\sim\patches.js',
  'src\sim\population.js',
  'src\sim\guilds.js',
  'src\sim\economy.js',
  'src\sim\expansions.js',
  'src\sim\competitors.js',
  'src\sim\agents.js',
  'src\sim\causes.js',
  'src\sim\events.js',
  'src\sim\crises.js',
  'src\sim\tick.js',
  'src\sim\places.js',
  'src\sim\ladder.js',
  'src\data\scenarios.js',
  'src\data\presets.js',
  'src\ui\charts.js',
  'src\ui\components.js',
  'src\ui\views-studio.js',
  'src\ui\views-research.js',
  'src\ui\views-world3d.js',
  'src\ui\views-ladder.js',
  'src\ui\views-patches.js',
  'src\ui\views-combat.js',
  'src\ui\views-events.js',
  'src\ui\views-world.js',
  'src\ui\views-talents.js',
  'src\ui\views-races.js',
  'src\ui\views-sim.js',
  'src\ui\views-design.js',
  'src\ui\views-live.js',
  'src\ui\app.js'
)

function Get-Bundle([string[]]$files) {
  $sb = New-Object System.Text.StringBuilder
  foreach ($f in $files) {
    $path = Join-Path $root $f
    if (-not (Test-Path $path)) { Write-Host "  skip (missing): $f"; continue }
    [void]$sb.AppendLine("/* ===================== $f ===================== */")
    [void]$sb.AppendLine([System.IO.File]::ReadAllText($path))
    [void]$sb.AppendLine()
  }
  return $sb.ToString()
}

function Build-File([string]$template, [string]$outFile, [string[]]$files, [string[]]$cssFiles) {
  $tplPath = Join-Path $root $template
  if (-not (Test-Path $tplPath)) { Write-Host "template missing: $template"; return }
  $html = [System.IO.File]::ReadAllText($tplPath)

  $js = Get-Bundle $files
  $html = $html.Replace('<!--PN_BUNDLE-->', "<script>`n$js`n</script>")

  $css = ''
  foreach ($c in $cssFiles) {
    $cp = Join-Path $root $c
    if (Test-Path $cp) { $css += [System.IO.File]::ReadAllText($cp) + "`n" }
  }
  $html = $html.Replace('<!--PN_CSS-->', "<style>`n$css`n</style>")

  $outPath = Join-Path $root $outFile
  $outDir = Split-Path -Parent $outPath
  if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
  [System.IO.File]::WriteAllText($outPath, $html, (New-Object System.Text.UTF8Encoding($false)))
  $kb = [math]::Round((Get-Item $outPath).Length / 1KB, 1)
  Write-Host "built $outFile  ($kb KB)"
}

Write-Host "Patch Notes bundler"
Build-File 'index.html' 'dist\PatchNotes.html' $sources @('styles\app.css')
Build-File 'tools\selftest.html' 'dist\selftest.html' ($sources | Where-Object { $_ -notlike 'src\ui\*' }) @()
Write-Host "done"
