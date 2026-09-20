$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore, WindowsBase
# Render the original vector artwork using Windows' built-in geometry renderer.
# The same SVG is the editable source for all icon sizes; no external packages.
[xml]$art = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'assets\launcher.svg') -Raw
$assets = Join-Path $PSScriptRoot 'assets'
$sizes = @(16, 20, 24, 32, 48, 64, 128, 256)
$frames = @()
foreach ($size in $sizes) {
    $visual = New-Object Windows.Media.DrawingVisual
    $context = $visual.RenderOpen()
    $context.PushTransform((New-Object Windows.Media.ScaleTransform(($size / 64.0), ($size / 64.0))))
    $rect = $art.svg.rect
    $background = [Windows.Media.BrushConverter]::new().ConvertFromString($rect.fill)
    $context.DrawRoundedRectangle($background, $null, [Windows.Rect]::new([double]$rect.x, [double]$rect.y, [double]$rect.width, [double]$rect.height), [double]$rect.rx, [double]$rect.rx)
    foreach ($group in $art.svg.g) {
        $pen = [Windows.Media.Pen]::new([Windows.Media.BrushConverter]::new().ConvertFromString($group.stroke), [double]$group.'stroke-width')
        $pen.StartLineCap = [Windows.Media.PenLineCap]::Square
        $pen.EndLineCap = [Windows.Media.PenLineCap]::Square
        foreach ($shape in $group.ChildNodes) {
            if ($shape.LocalName -eq 'path') {
                $context.DrawGeometry($null, $pen, [Windows.Media.Geometry]::Parse($shape.d))
            } elseif ($shape.LocalName -eq 'circle') {
                $fill = [Windows.Media.BrushConverter]::new().ConvertFromString($group.fill)
                $context.DrawEllipse($fill, $pen, [Windows.Point]::new([double]$shape.cx, [double]$shape.cy), [double]$shape.r, [double]$shape.r)
            }
        }
    }
    $context.Pop()
    $context.Close()
    $bitmap = [Windows.Media.Imaging.RenderTargetBitmap]::new($size, $size, 96, 96, [Windows.Media.PixelFormats]::Pbgra32)
    $bitmap.Render($visual)
    $encoder = [Windows.Media.Imaging.PngBitmapEncoder]::new()
    $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
    $memory = [IO.MemoryStream]::new()
    try { $encoder.Save($memory); $bytes = $memory.ToArray() } finally { $memory.Dispose() }
    $frames += ,$bytes
    if ($size -eq 256) { [IO.File]::WriteAllBytes((Join-Path $assets 'launcher.png'), $bytes) }
}
$output = [IO.File]::Create((Join-Path $assets 'launcher.ico'))
$writer = [IO.BinaryWriter]::new($output)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$frames[$i].Length); $writer.Write([uint32]$offset)
        $offset += $frames[$i].Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
} finally { $writer.Dispose(); $output.Dispose() }
Write-Host 'Built original launcher icon at 16-256px.'
