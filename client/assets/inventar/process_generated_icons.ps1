param(
    [string]$artDir = ""
)

[System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null

$outDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($artDir)) {
    # Default to current directory if not specified
    $artDir = $outDir
}

# 1. Process Weight Icon
$weightSrc = Get-ChildItem -Path $artDir -Filter "weight_scale_icon_*.png" | Select-Object -First 1
if ($weightSrc) {
    $img = [System.Drawing.Image]::FromFile($weightSrc.FullName)
    $bmp = New-Object System.Drawing.Bitmap(64, 64)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, 64, 64)
    $g.Dispose()
    $img.Dispose()

    $targetPath = Join-Path $outDir "weight_scale_icon.webp"
    $targetPath2 = Join-Path $outDir "weight_icon.webp"
    $bmp.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Save($targetPath2, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "✓ Saved weight scale icon directly to webp: $targetPath"
}

# 2. Process Jewelry Slot Icons (Crop into Earring, Necklace, Ring)
$jewelSrc = Get-ChildItem -Path $artDir -Filter "jewelry_slot_icons_monochrome_*.png" | Select-Object -First 1
if ($jewelSrc) {
    $img = [System.Drawing.Bitmap]::FromFile($jewelSrc.FullName)
    $w = $img.Width
    $h = $img.Height

    # Crop left -> Earring, center -> Necklace, right -> Ring
    $cellW = [int]($w / 3)

    function Save-Cropped-Slot($xStart, $filename) {
        $cropRect = New-Object System.Drawing.Rectangle($xStart, 0, $cellW, $h)
        $croppedBmp = $img.Clone($cropRect, $img.PixelFormat)
        
        $resizedBmp = New-Object System.Drawing.Bitmap(64, 64)
        $g = [System.Drawing.Graphics]::FromImage($resizedBmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.DrawImage($croppedBmp, 0, 0, 64, 64)
        $g.Dispose()
        $croppedBmp.Dispose()

        $outPath = Join-Path $outDir $filename
        $resizedBmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $resizedBmp.Dispose()
        Write-Host "✓ Saved jewelry slot icon directly to webp: $outPath"
    }

    Save-Cropped-Slot 0 "slot_earring.webp"
    Save-Cropped-Slot $cellW "slot_necklace.webp"
    Save-Cropped-Slot ($cellW * 2) "slot_ring.webp"

    # Also save with alternative naming
    Save-Cropped-Slot 0 "earring_slot.webp"
    Save-Cropped-Slot $cellW "necklace_slot.webp"
    Save-Cropped-Slot ($cellW * 2) "ring_slot.webp"

    $img.Dispose()
}
