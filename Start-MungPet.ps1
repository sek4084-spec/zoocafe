Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$petDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$petSources = @((Join-Path $petDir 'PetChat.cs'), (Join-Path $petDir 'MungPet.cs'))
Add-Type -Path $petSources -ReferencedAssemblies @('System.Windows.Forms', 'System.Drawing', 'System.Web.Extensions', 'System.Security')
[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::Run([MungPet]::new($petDir))
