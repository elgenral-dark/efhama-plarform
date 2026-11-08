$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host ''
Write-Host 'إعداد منصة افهمها' -ForegroundColor Cyan
Write-Host 'سيتم إنشاء قاعدة بيانات جديدة داخل هذا المجلد إذا لم تكن موجودة.'
Write-Host ''
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js غير مثبت. ثبتي Node.js 22.13 أو أحدث ثم أعيدي المحاولة.' }
$version = (node -p "process.versions.node").Trim()
$major = [int]($version.Split('.')[0])
$minor = [int]($version.Split('.')[1])
if (($major -lt 22) -or ($major -eq 22 -and $minor -lt 13)) { throw "إصدار Node.js الحالي $version. يلزم 22.13 أو أحدث." }
if (-not (Test-Path '.\node_modules\express')) {
  Write-Host 'تثبيت المكتبات...' -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) { throw 'فشل تثبيت المكتبات.' }
}
npm run reset-admin
if ($LASTEXITCODE -ne 0) { throw 'لم يكتمل إعداد حساب المسؤول. راجعي الخطأ أعلاه.' }
Write-Host ''
Write-Host 'تم الإعداد. سيبدأ تشغيل المنصة الآن.' -ForegroundColor Green
npm start
