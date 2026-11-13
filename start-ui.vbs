Option Explicit
Dim shell, files, folder, request, running, attempt, command, nodePath
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
folder = files.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = folder
running = False
On Error Resume Next
Set request = CreateObject("MSXML2.ServerXMLHTTP.6.0")
request.setTimeouts 1000, 1000, 1000, 1000
request.open "GET", "http://127.0.0.1:17321/api/status", False
request.send
running = (request.status = 200)
Err.Clear
On Error GoTo 0
If running Then
  If InStr(request.responseText, Chr(34) & "version" & Chr(34) & ":" & Chr(34) & "2.4.7" & Chr(34)) = 0 Then
    MsgBox "Eski program surumu arka planda acik. Programi kapat dugmesiyle kapatip kisayolu tekrar acin. Hesaplariniz korunur." & vbCrLf & vbCrLf & "An older version is still running. Quit the app, then reopen this shortcut. Saved accounts are kept.", 48, "Steam HourForge X - Restart required"
    WScript.Quit 1
  End If
End If
If Not running Then
  nodePath = folder & "\.runtime\node-v26.13.1-win-x64\node.exe"
  If Not files.FileExists(nodePath) Then nodePath = "node.exe"
  If Not files.FolderExists(folder & "\data") Then files.CreateFolder(folder & "\data")
  command = Chr(34) & nodePath & Chr(34) & " " & Chr(34) & folder & "\dist\index.js" & Chr(34) & " > " & Chr(34) & folder & "\data\steam-hourforge-x.log" & Chr(34) & " 2>&1"
  shell.Run "cmd.exe /d /c " & Chr(34) & command & Chr(34), 0, False
  For attempt = 1 To 20
    WScript.Sleep 500
    On Error Resume Next
    request.open "GET", "http://127.0.0.1:17321/api/status", False
    request.send
    running = (Err.Number = 0 And request.status = 200)
    Err.Clear
    On Error GoTo 0
    If running Then Exit For
  Next
End If
If running Then
  If WScript.Arguments.Count > 0 Then
    If WScript.Arguments(0) = "--check" Then
      WScript.Echo "Steam HourForge X is running."
      WScript.Quit 0
    End If
  End If
  shell.Run "http://127.0.0.1:17321", 1, False
Else
  MsgBox "Program baslatilamadi. Program klasorundeki start.bat dosyasini calistirin ve data\steam-hourforge-x.log dosyasini kontrol edin.", 48, "Steam HourForge X"
End If

