; Дополнения к установщику NSIS (electron-builder берёт этот файл из buildResources).
;
; Установщик сам закрывает только Zvon.exe. Процесс sing-box.exe (туннель
; TikTok) из resources\singbox мог пережить приложение — тогда старый
; деинсталлятор и копирование новых файлов не могут заменить его, и
; обновление падает с ошибкой копирования или оставляет пустую папку singbox.
; Закрываем только процессы из папки установки: чужие sing-box не трогаем.

!macro zvonStopBundledProcesses
  ; Установщик 32-битный: у 64-битных процессов Get-Process не отдаёт Path,
  ; поэтому путь берём из WMI.
  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $$_.Name -eq 'sing-box.exe' -and $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith('$INSTDIR\', [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
  Pop $0
  Sleep 500
!macroend

!macro customInit
  !insertmacro zvonStopBundledProcesses
!macroend

!macro customUnInit
  !insertmacro zvonStopBundledProcesses
!macroend
