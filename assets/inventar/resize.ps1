Add-Type -AssemblyName System.Drawing
$dir = "D:\games\yandex\лайнэйдж\project-steam\client\assets\inventar"
Set-Location -Path $dir
$files = Get-ChildItem -Path $dir -Filter "*.jpeg"
foreach ($file in $files) {
    try {
        $img = [System.Drawing.Image]::FromFile($file.FullName)
        $bmp = New-Object System.Drawing.Bitmap 64, 64
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($img, 0, 0, 64, 64)
        $g.Dispose()
        $img.Dispose()

        $pngPath = [System.IO.Path]::ChangeExtension($file.FullName, ".png")
        $bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        Write-Host "Created 64x64 PNG: $($file.Name)"
    } catch {
        Write-Host "Error: $_"
    }
}
