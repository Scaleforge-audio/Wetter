# Kleiner lokaler Webserver fuer Klar (nur PowerShell, kein Python/Node noetig)
param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\', '/')
$rootCheck = $root + [IO.Path]::DirectorySeparatorChar

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'; '.webmanifest' = 'application/manifest+json'; '.svg' = 'image/svg+xml'
  '.png' = 'image/png'; '.ico' = 'image/x-icon'; '.woff2' = 'font/woff2'; '.md' = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
}

# Freien Port suchen
$listener = $null
for ($p = $Port; $p -lt $Port + 20; $p++) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$p/")
  try { $l.Start(); $listener = $l; $Port = $p; break } catch { $l.Close() }
}
if (-not $listener) { Write-Host 'Kein freier Port zwischen 8000 und 8019 gefunden.'; exit 1 }

$url = "http://localhost:$Port/"
Write-Host ''
Write-Host "  Klar laeuft auf $url"
Write-Host '  Zum Beenden dieses Fenster schliessen oder Strg+C druecken.'
Write-Host ''
Start-Process $url

try {
  while ($listener.IsListening) {
    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(250)) { }
    $ctx = $task.GetAwaiter().GetResult()
    $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
      if ($path.EndsWith('/')) { $path += 'index.html' }
      $file = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $path.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)))
      if (-not $file.StartsWith($rootCheck, [StringComparison]::OrdinalIgnoreCase) -or -not [IO.File]::Exists($file)) {
        $res.StatusCode = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes('Nicht gefunden')
        $res.ContentType = 'text/plain; charset=utf-8'
      } else {
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $type = 'application/octet-stream'
        if ($mime.ContainsKey($ext)) { $type = $mime[$ext] }
        $res.ContentType = $type
        $res.Headers.Add('Cache-Control', 'no-cache')
        $bytes = [IO.File]::ReadAllBytes($file)
      }
      $res.ContentLength64 = $bytes.Length
      if ($ctx.Request.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
      Write-Host ("  {0} {1}" -f $res.StatusCode, $path)
    } catch {
      Write-Host "  Fehler: $_"
    } finally {
      $res.Close()
    }
  }
} finally {
  $listener.Stop()
}
