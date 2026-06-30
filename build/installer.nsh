!include LogicLib.nsh
!include nsDialogs.nsh

!ifndef BUILD_UNINSTALLER
Var DesktopShortcutCheckbox
Var ShouldCreateDesktopShortcut

Function DesktopShortcutOptionsPage
  IfSilent 0 +2
  Abort

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "选择安装选项"
  Pop $0

  ${NSD_CreateCheckbox} 0 34u 100% 12u "创建桌面快捷方式"
  Pop $DesktopShortcutCheckbox
  ${NSD_Check} $DesktopShortcutCheckbox

  nsDialogs::Show
FunctionEnd

Function DesktopShortcutOptionsLeave
  ${NSD_GetState} $DesktopShortcutCheckbox $ShouldCreateDesktopShortcut
FunctionEnd

!macro customInit
  StrCpy $ShouldCreateDesktopShortcut ${BST_CHECKED}
!macroend

!macro customPageAfterChangeDir
  Page custom DesktopShortcutOptionsPage DesktopShortcutOptionsLeave
!macroend

!macro customInstall
  ${If} $ShouldCreateDesktopShortcut == ${BST_UNCHECKED}
  ${AndIf} ${FileExists} "$newDesktopLink"
    Delete "$newDesktopLink"
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${EndIf}
!macroend
!endif
