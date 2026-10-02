# Recompresse les images des cinematiques pour le jeu (largeur max 360 px).
# - portraits avec transparence (alpha < 255 quelque part) : PNG 32 bits, transparence conservee, pour que le fond
#   des scenes (polaroids, cadres, teinte) reste visible a travers ; ils ne sont PAS aplatis sur un fond sombre.
# - portraits opaques : JPEG (qualite $Quality), nettement plus legers.
# Les vignettes pixelisees (*-lo.png) sont copiees telles quelles.
# Le choix PNG / JPEG est automatique : l'alpha est detecte pixel par pixel sur la source.
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
$dstAbs = (Resolve-Path $Dst).Path

# Vrai si au moins un pixel de l'image n'est pas totalement opaque.
function Test-HasAlpha([System.Drawing.Image]$image) {
  $w = $image.Width; $h = $image.Height
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.DrawImage($image, 0, 0, $w, $h)
  $g.Dispose()
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bytes = New-Object byte[] ($data.Stride * $h)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $stride = $data.Stride
  $bmp.UnlockBits($data); $bmp.Dispose()
  for ($y = 0; $y -lt $h; $y++) {
    $row = $y * $stride + 3
    for ($x = 0; $x -lt $w; $x++) { if ($bytes[$row + $x * 4] -lt 255) { return $true } }
  }
  return $false
}

foreach ($n in $names) {
  $img = [System.Drawing.Image]::FromFile((Resolve-Path "$Src/$n.png"))
  $w = [Math]::Min($MaxWidth, $img.Width); $h = [int]($img.Height * $w / $img.Width)
  $alpha = Test-HasAlpha $img
  if ($alpha) {
    # Transparence conservee : bitmap ARGB, aucun Clear() avec une couleur opaque, SourceCopy pour ne pas melanger a un fond.
    $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $attr = New-Object System.Drawing.Imaging.ImageAttributes
    $attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
    $dest = New-Object System.Drawing.Rectangle 0, 0, $w, $h
    $g.DrawImage($img, $dest, 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel, $attr)
    $bmp.Save((Join-Path $dstAbs "$n.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $attr.Dispose()
    $out = "$n.png"
    # Evite qu'un ancien .jpg obsolete soit choisi a la place par port-maquette.mjs.
    $stale = Join-Path $dstAbs "$n.jpg"
    if (Test-Path $stale) { Remove-Item $stale }
  } else {
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(11, 14, 20))
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $w, $h)
    $bmp.Save((Join-Path $dstAbs "$n.jpg"), $codec, $params)
    $out = "$n.jpg"
    $stale = Join-Path $dstAbs "$n.png"
    if (Test-Path $stale) { Remove-Item $stale }
  }
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  Write-Output $out
}
Copy-Item "$Src/portrait-passeur-cam-lo.png", "$Src/portrait-seconde-cam-lo.png" $Dst
