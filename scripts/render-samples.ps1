Add-Type -AssemblyName System.Drawing
$samples = Get-Content -LiteralPath artifacts/generation-samples.json -Raw | ConvertFrom-Json
$bitmap = [System.Drawing.Bitmap]::new(1030,1080)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#faf7f0'))
$font = [System.Drawing.Font]::new('Arial',14)
$pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(48,59,54),2)
$palette = @('#d9d9ee','#f0d4bb','#c7dfd0','#f0e5ac','#e8c7d4','#c3dce7','#dbdfb9','#d2c5df','#bce0dd','#eebfb8','#cbd3e8','#e5d8c3')
$brushes = @($palette | ForEach-Object { [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($_)) })
for ($k=0; $k -lt $samples.Count; $k++) {
  $sample=$samples[$k]; $x=25+($k%3)*340; $y=45+[Math]::Floor($k/3)*355; $cell=25; $n=$sample.n
  $graphics.DrawString(($sample.mode+' / seed '+$sample.seed),$font,[System.Drawing.Brushes]::Black,[single]$x,[single]($y-30))
  for ($i=0; $i -lt $n*$n; $i++) {
    $cx=$x+($i%$n)*$cell; $cy=$y+[Math]::Floor($i/$n)*$cell; $id=$sample.regions[$i]
    $graphics.FillRectangle($brushes[$id],[single]$cx,[single]$cy,$cell,$cell)
    if (($i%$n -eq $n-1) -or ($sample.regions[$i+1] -ne $id)) { $graphics.DrawLine($pen,[single]($cx+$cell),[single]$cy,[single]($cx+$cell),[single]($cy+$cell)) }
    if (($i+$n -ge $n*$n) -or ($sample.regions[$i+$n] -ne $id)) { $graphics.DrawLine($pen,[single]$cx,[single]($cy+$cell),[single]($cx+$cell),[single]($cy+$cell)) }
  }
  $graphics.DrawRectangle($pen,[single]$x,[single]$y,($cell*$n),($cell*$n))
}
$bitmap.Save((Join-Path (Get-Location) 'artifacts/region-samples.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose(); $font.Dispose(); $pen.Dispose()
foreach ($brush in $brushes) { $brush.Dispose() }
