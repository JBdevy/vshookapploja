[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('mobile', 'hook-keys')]
  [string]$TagPrefix,

  [string]$Remote = 'origin'
)

$ErrorActionPreference = 'Stop'

function Invoke-GitLines {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $result = @(& git @Arguments 2>$null)
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao executar: git $($Arguments -join ' ')"
  }
  return $result
}

try {
  [void](Invoke-GitLines -Arguments @('rev-parse', '--is-inside-work-tree'))

  $tagGlob = "$TagPrefix-v*-build*"
  $tagPattern = '^' + [regex]::Escape($TagPrefix) +
    '-v[0-9]+\.[0-9]+\.[0-9]+-build(?<build>[1-9][0-9]*)$'
  $tags = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase)

  foreach ($tag in Invoke-GitLines -Arguments @('tag', '--list', $tagGlob)) {
    $cleanTag = ([string]$tag).Trim()
    if ($cleanTag) { [void]$tags.Add($cleanTag) }
  }

  $remoteGlob = "refs/tags/$tagGlob"
  foreach ($line in Invoke-GitLines -Arguments @(
      'ls-remote', '--tags', '--refs', $Remote, $remoteGlob)) {
    $columns = ([string]$line).Trim() -split '\s+', 2
    if ($columns.Count -ne 2) { continue }
    $remoteTag = $columns[1] -replace '^refs/tags/', ''
    if ($remoteTag) { [void]$tags.Add($remoteTag) }
  }

  [long]$greatestBuild = 0
  foreach ($tag in $tags) {
    $match = [regex]::Match($tag, $tagPattern)
    if (-not $match.Success) { continue }
    [long]$number = $match.Groups['build'].Value
    if ($number -gt $greatestBuild) { $greatestBuild = $number }
  }

  # Limite documentado para versionCode do Android/Google Play.
  [long]$androidMaximum = 2100000000
  if ($greatestBuild -ge $androidMaximum) {
    throw "O maior build ja atingiu o limite Android: $androidMaximum."
  }

  Write-Output ($greatestBuild + 1)
} catch {
  Write-Error "Nao foi possivel calcular o proximo build: $($_.Exception.Message)"
  exit 1
}
