Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("d:\Projects\UntitledMachines\mouse_sprites_3.png")
Write-Host "$($img.Width)x$($img.Height)"
$img.Dispose()
