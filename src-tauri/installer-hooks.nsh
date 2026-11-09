; Nightfall 2.0 replaces the 1.x (Electron) app: remove the old copy quietly so only one Nightfall stays installed.
; Your library and play history are kept — 2.0 imports them on first launch.
!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$LOCALAPPDATA\Programs\nightfall-launcher\Uninstall Nightfall Launcher.exe" 0 +3
    nsExec::Exec 'taskkill /F /IM "Nightfall Launcher.exe" /T'
    ExecWait '"$LOCALAPPDATA\Programs\nightfall-launcher\Uninstall Nightfall Launcher.exe" /S _?=$LOCALAPPDATA\Programs\nightfall-launcher'
!macroend
