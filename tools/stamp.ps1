# 上傳前在 index.html 蓋上版本號：importmap 讓每個 js 都帶 ?v=，瀏覽器才不會新舊檔混著用
# 由「更新網站.bat」呼叫，平常開發不用跑
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$html = Join-Path $root 'index.html'
$v = Get-Date -Format 'yyyyMMddHHmm'

$lines = @("      `"three`": `"./vendor/three.module.min.js?v=$v`"")
foreach ($f in Get-ChildItem (Join-Path $root 'js') -Filter *.js | Sort-Object Name) {
  $lines += "      `"./js/$($f.Name)`": `"./js/$($f.Name)?v=$v`""
}
$map = "<script type=`"importmap`">`n    { `"imports`": {`n" + ($lines -join ",`n") + "`n    } }`n  </script>"

$utf8 = New-Object System.Text.UTF8Encoding($false)
$text = [IO.File]::ReadAllText($html, $utf8)
$text = [regex]::Replace($text, '(?s)<script type="importmap">.*?</script>', { param($m) $map })
$text = [regex]::Replace($text, 'href="css/style\.css(\?v=\d+)?"', "href=`"css/style.css?v=$v`"")
$text = [regex]::Replace($text, 'src="js/main\.js(\?v=\d+)?"', "src=`"js/main.js?v=$v`"")
[IO.File]::WriteAllText($html, $text.Replace("`r`n", "`n"), $utf8)
Write-Host "Stamped version $v"
