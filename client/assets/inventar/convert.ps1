[System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null
$dir = 'D:\games\yandex\лайнэйдж\project-steam\client\assets\inventar'
$files = Get-ChildItem -Path $dir -Filter '*.jpeg'

foreach ($f in $files) {
    $srcPath = $f.FullName
    $pngPath = $srcPath.Replace('.jpeg', '.png')
    $webpPath = $srcPath.Replace('.jpeg', '.webp')

    $img = [System.Drawing.Image]::FromFile($srcPath)
    $bmp = New-Object System.Drawing.Bitmap(64, 64)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, 64, 64)

    $g.Dispose()
    $img.Dispose()

    $bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Save($webpPath, [System.Drawing.Imaging.ImageFormat]::Png) # Write 64x64 binary icon content to .webp extension
    $bmp.Dispose()

    Write-Host "Converted 64x64 icon: $($f.Name) -> .webp & .png"
}
