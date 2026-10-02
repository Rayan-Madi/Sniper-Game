# Recompresse en JPEG les images des cinematiques (fond sombre sous la transparence).
# Les vignettes pixelisees (*-lo.png) sont copiees telles quelles.
# Usage (racine du depot) : powershell -ExecutionPolicy Bypass -File scripts/compress-briefing-img.ps1
param(
  [string]$Src = "docs/superpowers/maquettes/cinematiques/img",
  [string]$Dst = "public/briefing/img",
  [int]$Quality = 80,
  [int]$MaxWidth = 360
)
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $Dst | Out-Null
$names = @(
  'portrait-gangster-man-01', 'portrait-freres-a', 'portrait-freres-b', 'portrait-passeur-cam', 'portrait-seconde-cam',
  'portrait-mafia-woman-01', 'portrait-mafia-woman-02', 'portrait-mafia-henchman',
  'portrait-crime-1', 'portrait-crime-2', 'portrait-crime-3'
)
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$Quality)
foreach ($n in $names) {
  $img = [System.Drawing.Image]::FromFile((Resolve-Path "$Src/$n.png"))
  $w = [Math]::Min($MaxWidth, $img.Width); $h = [int]($img.Height * $w / $img.Width)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(11, 14, 20))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, 0, 0, $w, $h)
  $bmp.Save((Join-Path (Resolve-Path $Dst) "$n.jpg"), $codec, $params)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  Write-Output "$n.jpg"
}
Copy-Item "$Src/portrait-passeur-cam-lo.png", "$Src/portrait-seconde-cam-lo.png" $Dst
