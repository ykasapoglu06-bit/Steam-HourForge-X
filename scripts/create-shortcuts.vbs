Option Explicit
Dim shell, files, folder, link, destinations, item
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
folder = files.GetParentFolderName(files.GetParentFolderName(WScript.ScriptFullName))
destinations = Array(folder, shell.SpecialFolders("Desktop"))
For Each item In destinations
  Set link = shell.CreateShortcut(item & "\Steam HourForge X.lnk")
  link.TargetPath = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe")
  link.Arguments = Chr(34) & folder & "\start-ui.vbs" & Chr(34)
  link.WorkingDirectory = folder
  link.IconLocation = folder & "\ui\steam-hourforge-x.ico,0"
  link.Description = "Steam HourForge X - Local dashboard"
  link.Save
Next
