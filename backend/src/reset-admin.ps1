# Windows PowerShell 5.1 requires a UTF-8 BOM to read the Arabic prompts below.
$ErrorActionPreference = 'Stop'
Write-Host ""
Write-Host "استعادة حساب مسؤول منصة افهمها" -ForegroundColor Cyan
Write-Host "سيتم تعديل كلمة المرور في قاعدة بيانات هذا المشروع فقط."
Write-Host ""
$email = Read-Host "بريد المسؤول [admin@efhama.local]"
if ([string]::IsNullOrWhiteSpace($email)) { $email = 'admin@efhama.local' }
$email = $email.Trim().ToLowerInvariant()
$securePassword = Read-Host "كلمة المرور الجديدة (12 حرفًا على الأقل)" -AsSecureString
$secureConfirm = Read-Host "أعيدي كتابة كلمة المرور" -AsSecureString
$ptr1 = [IntPtr]::Zero
$ptr2 = [IntPtr]::Zero
try {
  $ptr1 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $ptr2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureConfirm)
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr1)
  $confirm = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr2)
  if ($password.Length -lt 12) { throw 'كلمة المرور يجب أن تكون 12 حرفًا على الأقل.' }
  if ($password -cne $confirm) { throw 'كلمتا المرور غير متطابقتين.' }
  if ($email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { throw 'صيغة البريد الإلكتروني غير صحيحة.' }
  $env:EFHAMA_ADMIN_EMAIL = $email
  $env:EFHAMA_ADMIN_PASSWORD = $password
  Write-Host ""
  & node .\src\reset-admin.js
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
catch {
  Write-Host "`nلم يتم تغيير كلمة المرور: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
finally {
  if ($ptr1 -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr1) }
  if ($ptr2 -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr2) }
  Remove-Item Env:EFHAMA_ADMIN_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:EFHAMA_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  $password = $null; $confirm = $null
  $securePassword.Dispose(); $secureConfirm.Dispose()
}
