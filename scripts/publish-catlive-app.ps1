param([string]$Version = '', [string]$Message = '')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
function Invoke-Git {
    $result = & git @args
    if ($LASTEXITCODE -ne 0) { throw "Git falhou: $($args[0])" }
    return $result
}
try {
    if (!(Get-Command git -ErrorAction SilentlyContinue)) { throw 'Instale o Git para Windows.' }
    $origin = Invoke-Git config --get remote.origin.url
    if ($origin -notin @('https://github.com/JBdevy/vshookapploja', 'https://github.com/JBdevy/vshookapploja.git', 'git@github.com:JBdevy/vshookapploja.git')) { throw 'Execute na pasta apploja do CatLive.' }
    $branch = Invoke-Git branch --show-current
    if (!$branch) { throw 'Selecione uma branch antes de continuar.' }
    if (!$Version) { $Version = Read-Host 'Versao do CatLive (ex.: 1.16)' }
    $Version = $Version -creplace '^v', ''
    if ($Version -cnotmatch '^[0-9]+\.[0-9]{2}$') { throw 'Use X.XX (ex.: 1.16).' }
    if (!$Message) { $Message = Read-Host 'Mensagem do commit' }
    if ([string]::IsNullOrWhiteSpace($Message)) { throw 'Informe a mensagem do commit.' }

    # Use the existing Git login when GitHub CLI is not installed.
    if (Get-Command gh -ErrorAction SilentlyContinue) {
        $secretJson = & gh secret list --repo JBdevy/vshookapploja --json name
        if ($LASTEXITCODE -ne 0) { throw 'Confira o login do GitHub CLI: gh auth login.' }
        $secretNames = @($secretJson | ConvertFrom-Json | ForEach-Object { $_.name })
    } else {
        $credential = "protocol=https`nhost=github.com`n`n" | & git credential fill
        if ($LASTEXITCODE -ne 0) { throw 'Entre no GitHub pelo Git para Windows.' }
        $fields = @{}
        foreach ($line in $credential) { if ($line -match '^([^=]+)=(.*)$') { $fields[$Matches[1]] = $Matches[2] } }
        if (!$fields['password']) { throw 'Login GitHub indisponivel no Git.' }
        $headers = @{ Authorization = 'Bearer ' + $fields['password']; Accept = 'application/vnd.github+json' }
        $response = Invoke-RestMethod -Uri 'https://api.github.com/repos/JBdevy/vshookapploja/actions/secrets?per_page=100' -Headers $headers
        $secretNames = @($response.secrets | ForEach-Object { $_.name })
        $headers.Clear(); $fields.Clear(); $credential = $null
    }
    foreach ($name in @('IOS_TEAM_ID','IOS_CERT_P12_BASE64','IOS_CERT_PASSWORD','CATLIVE_IOS_PROVISION_PROFILE_BASE64','CATLIVE_APP_STORE_CONNECT_KEY_ID','CATLIVE_APP_STORE_CONNECT_ISSUER_ID','CATLIVE_APP_STORE_CONNECT_API_KEY_P8_BASE64','KEYSTORE_BASE64','KEYSTORE_PASSWORD','KEY_ALIAS','KEY_PASSWORD')) {
        if ($name -notin $secretNames) { throw "Secret ausente: $name" }
    }
    $tags = Invoke-Git ls-remote --tags --refs origin 'catlive-app-v*-build*'
    [long]$build = 1001
    foreach ($line in $tags) { if ($line -match 'refs/tags/catlive-app-v[0-9]+\.[0-9]{2}-build([1-9][0-9]*)$') { $build = [Math]::Max($build, [long]$Matches[1] + 1) } }
    if ($env:CATLIVE_MIN_BUILD_NUMBER) {
        if ($env:CATLIVE_MIN_BUILD_NUMBER -notmatch '^[1-9][0-9]*$') { throw 'Build minimo invalido.' }
        $build = [Math]::Max($build, [long]$env:CATLIVE_MIN_BUILD_NUMBER)
    }
    $tag = "catlive-app-v$Version-build$build"
    $files = @('.gitattributes', 'JarasLive', ':(exclude)JarasLive/Windows/**', ':(exclude)JarasLive/output/**', '.github/workflows/catlive-ios-appstore.yml', '.github/workflows/catlive-android-release.yml', '.github/workflows/catlive-app-release.yml', '03 build catlive app.bat', '03 build catlive app.command', 'scripts/publish-catlive-app.ps1', 'scripts/publish-catlive-app.sh', 'scripts/test-catlive-app-release.py')
    Write-Host "CatLive $Version - build $build"
    Invoke-Git status --short -- @files
    Invoke-Git add -A -- @files
    Invoke-Git -c 'core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol' diff --cached --check -- @files
    & git diff --cached --quiet -- @files
    $diffStatus = $LASTEXITCODE
    if ($diffStatus -eq 1) { Invoke-Git commit --only -m $Message -- @files }
    elseif ($diffStatus -ne 0) { throw 'Falha ao conferir alteracoes.' }
    $source = Invoke-Git rev-parse HEAD
    $manifest = @{ version = $Version; build_number = [string]$build; source_ref = $source } | ConvertTo-Json
    [IO.File]::WriteAllText((Join-Path $PWD '.github/catlive-app-release.json'), $manifest + "`n", (New-Object Text.UTF8Encoding($false)))
    Invoke-Git add -- .github/catlive-app-release.json
    Invoke-Git commit --only -m "Release CatLive App $Version build $build" -- .github/catlive-app-release.json
    Invoke-Git tag -a $tag -m "CatLive App $Version build $build; source $source"
    Invoke-Git push --atomic origin "HEAD:refs/heads/$branch" "refs/tags/$tag"
    Write-Host "Build disparado: https://github.com/JBdevy/vshookapploja/actions/workflows/catlive-app-release.yml"
    Write-Host "IPA, APK e AAB: https://github.com/JBdevy/vshookapploja/releases/tag/$tag"
} catch {
    Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
