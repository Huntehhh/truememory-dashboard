' Hidden launcher for the TrueMemory Observatory sidecar.
' Invoked by the startup orchestrator; runs run-sidecar-loop.ps1 with no
' console window and does not block until exit.

Option Explicit

Dim shell, script, scriptDir, cmd
Set shell = CreateObject("WScript.Shell")

script = WScript.ScriptFullName
scriptDir = Left(script, InStrRev(script, "\") - 1)

cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptDir & "\run-sidecar-loop.ps1"""

shell.Run cmd, 0, False
