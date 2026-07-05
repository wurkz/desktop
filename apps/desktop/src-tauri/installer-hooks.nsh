; Zorviz NSIS installer hooks (BACK/pre-ship): open the LAN server port so phones can
; reach the app at http://<pc-lan-ip>:3030 without a manual admin step. Requires the
; installer to run elevated (installMode = perMachine).

; After install: (re)create the inbound TCP 3030 rule. Delete first so re-installs/upgrades
; don't stack duplicate rules with the same name. Rule name matches the app's runtime
; best-effort rule, so they never conflict.
!macro NSIS_HOOK_POSTINSTALL
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Zorviz LAN Server (Port 3030)"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Zorviz LAN Server (Port 3030)" dir=in action=allow protocol=TCP localport=3030 profile=any'
!macroend

; After uninstall: remove the rule we added.
!macro NSIS_HOOK_POSTUNINSTALL
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Zorviz LAN Server (Port 3030)"'
!macroend
