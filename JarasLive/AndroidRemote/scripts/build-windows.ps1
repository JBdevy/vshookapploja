param([string]$Device='', [switch]$Install)
$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
if(!$env:ANDROID_HOME){$env:ANDROID_HOME=Join-Path $env:LOCALAPPDATA 'Android\Sdk'}
if(!(Test-Path (Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'))){throw 'Android SDK not found. Set ANDROID_HOME.'}
$java=if($env:JAVA_HOME){Join-Path $env:JAVA_HOME 'bin\java.exe'}else{''}
if(!$java -or !(Test-Path $java)){throw 'Set JAVA_HOME to a complete JDK 17 or newer.'}
& $java -version
Set-Content (Join-Path $project 'local.properties') ('sdk.dir='+$env:ANDROID_HOME.Replace('\','/').Replace(':','\:')) -Encoding ascii
Push-Location $project
try {
 & .\gradlew.bat testDebugUnitTest lintDebug assembleDebug --console=plain
 if($LASTEXITCODE -ne 0){throw "Android build/tests failed: $LASTEXITCODE"}
 $apk=Join-Path $project 'app\build\outputs\apk\debug\app-debug.apk'
 if($Install){
  $adb=Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
  $args=@();if($Device){$args+=@('-s',$Device)}
  & $adb @args install -r $apk
  if($LASTEXITCODE -ne 0){throw 'Android did not accept the installation. Check its USB-installation prompt/settings.'}
  & $adb @args shell am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n com.hookdeveloper.catlive.remote/.MainActivity
  if($LASTEXITCODE -ne 0){throw 'Android app launch failed.'}
 }
 Write-Output $apk
} finally {Pop-Location}
