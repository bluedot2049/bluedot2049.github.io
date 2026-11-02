# 上傳前在 index.html 蓋上版本號：importmap 讓每個 js 都帶 ?v=，瀏覽器才不會新舊檔混著用
# 順便寫好每個區域要先下載的模組（modulepreload），不必等 import 一層一層往下找
# 由「更新網站.bat」呼叫，平常開發不用跑
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$html = Join-Path $root 'index.html'
$v = Get-Date -Format 'yyyyMMddHHmm'
$utf8 = New-Object System.Text.UTF8Encoding($false)

# 一個檔案 import 了哪些檔案：static 是開頭的 import / export from，dynamic 是 import('...')
# 路徑換成從網站根目錄算起，例如 js/zones/gallery/world.js、vendor/Water.js；'three' 換成 vendor 裡的檔案
$cache = @{}
function Get-Imports($file) {
  if ($cache.ContainsKey($file)) { return $cache[$file] }
  $text = [IO.File]::ReadAllText((Join-Path $root $file), $utf8)
  $dir = [IO.Path]::GetDirectoryName($file).Replace('\', '/')
  $resolve = {
    param($spec)
    if ($spec -eq 'three') { return 'vendor/three.module.min.js' }
    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($p in ($dir + '/' + $spec).Split('/')) {
      if ($p -eq '..') { $parts.RemoveAt($parts.Count - 1) } elseif ($p -ne '.' -and $p -ne '') { $parts.Add($p) }
    }
    return ($parts -join '/')
  }
  $static = @(); $dynamic = @()
  foreach ($m in [regex]::Matches($text, '(?m)^\s*(?:import\s+[^''"();]*?\bfrom|import|export\s+[^''"();=]*?\bfrom)\s*[''"]([^''"]+)[''"]')) { $static += & $resolve $m.Groups[1].Value }
  foreach ($m in [regex]::Matches($text, 'import\(\s*[''"]([^''"]+)[''"]\s*\)')) { $dynamic += & $resolve $m.Groups[1].Value }
  $cache[$file] = @{ static = $static; dynamic = $dynamic }
  return $cache[$file]
}

# 從一個檔案出發，順著開頭的 import 找到的全部檔案
function Get-Closure($start) {
  $seen = New-Object System.Collections.Generic.HashSet[string]
  $todo = New-Object System.Collections.Generic.Stack[string]
  $todo.Push($start)
  while ($todo.Count) {
    $f = $todo.Pop()
    if (-not $seen.Add($f)) { continue }
    foreach ($d in (Get-Imports $f).static) { $todo.Push($d) }
  }
  return ,$seen
}

# 每個區域都要的：main.js 開頭 import 的。各區域另外要的：main.js 裡 import('./zone-*.js') 那個檔案，
# 加上它用 import() 載入的 js（vendor 裡看情況才載的，像後製，不先下載）
$core = Get-Closure 'js/main.js'
$zones = [ordered]@{}
foreach ($z in (Get-Imports 'js/main.js').dynamic) {
  if ($z -notmatch '^js/(?:[\w-]+/)*zone-([\w-]+)\.js$') { continue }
  $name = $Matches[1]
  $set = Get-Closure $z
  foreach ($f in @($set)) { foreach ($d in (Get-Imports $f).dynamic) { if ($d -like 'js/*') { $set.UnionWith((Get-Closure $d)) } } }
  $set.ExceptWith($core)
  $zones[$name] = $set
}

$href = { param($f) if ($f -like 'js/*' -or $f -eq 'vendor/three.module.min.js') { "$f`?v=$v" } else { $f } }
$list = { param($set) ($set | Sort-Object { $_ -ne 'vendor/three.module.min.js' }, { $_ } | ForEach-Object { "'" + (& $href $_) + "'" }) -join ', ' }
$zoneLines = $zones.Keys | ForEach-Object { "        $_`: [" + (& $list $zones[$_]) + "]" }
$preload = "<script id=`"preload`">`n    (function () {`n      var core = [" + (& $list ($core | Where-Object { $_ -ne 'js/main.js' })) + "];`n      var zones = {`n" + ($zoneLines -join ",`n") + "`n      };`n      var z = new URLSearchParams(location.search).get('z');`n      var all = core.concat(Object.prototype.hasOwnProperty.call(zones, z) ? zones[z] : zones.gallery);`n      for (var i = 0; i < all.length; i++) {`n        var l = document.createElement('link');`n        l.rel = 'modulepreload';`n        l.href = all[i];`n        document.head.appendChild(l);`n      }`n    })();`n  </script>"

# importmap 照舊列出 js 資料夾裡每一個模組，連子資料夾（沒用到的列著也不會被下載），只是順便提醒哪些檔案沒有被用到
# js/boot/ 是 index.html 直接用 <script src> 載的一般腳本，不是模組，不列
$used = New-Object System.Collections.Generic.HashSet[string]
$used.UnionWith($core)
foreach ($s in $zones.Values) { $used.UnionWith($s) }
foreach ($d in (Get-Imports 'js/main.js').dynamic) { if ($d -like 'js/*') { $used.UnionWith((Get-Closure $d)) } }
$lines = @("      `"three`": `"./vendor/three.module.min.js?v=$v`"")
$jsDir = Join-Path $root 'js'
$modules = Get-ChildItem $jsDir -Filter *.js -Recurse | ForEach-Object { 'js/' + $_.FullName.Substring($jsDir.Length + 1).Replace('\', '/') } | Where-Object { $_ -notlike 'js/boot/*' } | Sort-Object
foreach ($f in $modules) {
  $lines += "      `"./$f`": `"./$f`?v=$v`""
  if (-not $used.Contains($f)) { Write-Host "Not imported anywhere: $f" -ForegroundColor Yellow }
}
$map = "<script type=`"importmap`">`n    { `"imports`": {`n" + ($lines -join ",`n") + "`n    } }`n  </script>"

$text = [IO.File]::ReadAllText($html, $utf8)
$text = [regex]::Replace($text, '(?s)<script type="importmap">.*?</script>', { param($m) $map })
$text = [regex]::Replace($text, '(?s)<script id="preload">.*?</script>', { param($m) $preload })
# css 和 index.html 直接載的 js（main.js、boot/ 裡的）每個都蓋版本號
$text = [regex]::Replace($text, 'href="(css/[\w/-]+\.css)(\?v=\d+)?"', { param($m) "href=`"$($m.Groups[1].Value)?v=$v`"" })
$text = [regex]::Replace($text, 'src="(js/[\w/-]+\.js)(\?v=\d+)?"', { param($m) "src=`"$($m.Groups[1].Value)?v=$v`"" })
[IO.File]::WriteAllText($html, $text.Replace("`r`n", "`n"), $utf8)
Write-Host "Stamped version $v"
foreach ($k in $zones.Keys) { Write-Host "Preload ${k}: $($core.Count - 1) shared + $($zones[$k].Count) own" }
