param(
    [string]$srcDir = ""
)

if ([string]::IsNullOrEmpty($srcDir)) {
    Write-Host "Usage: .\copy.ps1 -srcDir <path_to_source_images_folder>"
    exit
}

$dstDir = $PSScriptRoot

Get-ChildItem -Path $srcDir -Filter "*.png" | ForEach-Object {
    $targetPath = Join-Path $dstDir $_.Name
    Copy-Item -Path $_.FullName -Destination $targetPath -Force
    Write-Host "Copied $($_.Name) to $targetPath"
}

