param(
  [string]$SourceDir = (Get-Location).Path,
  [string]$OutputDir,
  [int]$Size = 512,
  [switch]$Recurse,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$videoExtensions = @('.mp4', '.mov', '.avi', '.mkv', '.wmv', '.m4v', '.webm')

if (-not $OutputDir) {
  $OutputDir = Join-Path -Path $SourceDir -ChildPath '_explorer-thumbnails'
}

$resolvedSourceDir = (Resolve-Path -LiteralPath $SourceDir).Path

function Get-RelativeDirectoryPath {
  param(
    [string]$BasePath,
    [string]$TargetPath
  )

  $normalizedBase = [System.IO.Path]::GetFullPath($BasePath)
  $normalizedTarget = [System.IO.Path]::GetFullPath($TargetPath)

  if (-not $normalizedBase.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $normalizedBase = $normalizedBase + [System.IO.Path]::DirectorySeparatorChar
  }

  if ($normalizedTarget.Equals($normalizedBase.TrimEnd([System.IO.Path]::DirectorySeparatorChar), [System.StringComparison]::OrdinalIgnoreCase)) {
    return '.'
  }

  if ($normalizedTarget.StartsWith($normalizedBase, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $normalizedTarget.Substring($normalizedBase.Length)
  }

  throw "target_path_outside_source:$TargetPath"
}

if (-not ('ExplorerThumbnailExtractor' -as [type])) {
  Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class ExplorerThumbnailExtractor
{
    [Flags]
    private enum SIIGBF
    {
        ResizeToFit = 0x0,
        BiggerSizeOk = 0x1,
        MemoryOnly = 0x2,
        IconOnly = 0x4,
        ThumbnailOnly = 0x8,
        InCacheOnly = 0x10,
        CropToSquare = 0x20,
        WideThumbnail = 0x40,
        IconBackground = 0x80,
        ScaleUp = 0x100
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SIZE
    {
        public int cx;
        public int cy;
    }

    [ComImport]
    [Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItemImageFactory
    {
        void GetImage(SIZE size, SIIGBF flags, out IntPtr phbm);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(
        string pszPath,
        IntPtr pbc,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory ppv
    );

    [DllImport("gdi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DeleteObject(IntPtr hObject);

    public static void SaveThumbnail(string sourcePath, string destinationPath, int size)
    {
        var factoryGuid = typeof(IShellItemImageFactory).GUID;
        IShellItemImageFactory imageFactory = null;
        IntPtr bitmapHandle = IntPtr.Zero;

        try
        {
            SHCreateItemFromParsingName(sourcePath, IntPtr.Zero, factoryGuid, out imageFactory);
            imageFactory.GetImage(
                new SIZE { cx = size, cy = size },
                SIIGBF.BiggerSizeOk | SIIGBF.ThumbnailOnly,
                out bitmapHandle
            );

            if (bitmapHandle == IntPtr.Zero)
            {
                throw new InvalidOperationException("thumbnail_handle_not_created");
            }

            using (var bitmap = Image.FromHbitmap(bitmapHandle))
            {
                bitmap.Save(destinationPath, ImageFormat.Png);
            }
        }
        finally
        {
            if (bitmapHandle != IntPtr.Zero)
            {
                DeleteObject(bitmapHandle);
            }

            if (imageFactory != null)
            {
                Marshal.ReleaseComObject(imageFactory);
            }
        }
    }
}
"@
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$searchParams = @{
  LiteralPath = $resolvedSourceDir
  File = $true
}

if ($Recurse) {
  $searchParams.Recurse = $true
}

$videoFiles = @(Get-ChildItem @searchParams |
  Where-Object { $videoExtensions -contains $_.Extension.ToLowerInvariant() } |
  Sort-Object FullName)

$results = New-Object System.Collections.Generic.List[object]

foreach ($file in $videoFiles) {
  $relativeParent = Get-RelativeDirectoryPath -BasePath $resolvedSourceDir -TargetPath $file.DirectoryName
  $targetDirectory = if ($relativeParent -eq '.') {
    $OutputDir
  } else {
    Join-Path -Path $OutputDir -ChildPath $relativeParent
  }

  $targetDirectory = [System.IO.Path]::GetFullPath($targetDirectory)

  New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null

  $outputPath = [System.IO.Path]::GetFullPath((Join-Path -Path $targetDirectory -ChildPath ("{0}.png" -f $file.BaseName)))

  if ((-not $Force) -and (Test-Path -LiteralPath $outputPath)) {
    $results.Add([pscustomobject]@{
      source = $file.FullName
      output = $outputPath
      status = 'skipped_existing'
    }) | Out-Null
    continue
  }

  try {
    [ExplorerThumbnailExtractor]::SaveThumbnail($file.FullName, $outputPath, $Size)
    $results.Add([pscustomobject]@{
      source = $file.FullName
      output = $outputPath
      status = 'saved'
    }) | Out-Null
  } catch {
    $results.Add([pscustomobject]@{
      source = $file.FullName
      output = $outputPath
      status = 'failed'
      error = $_.Exception.Message
    }) | Out-Null
  }
}

$savedCount = @($results | Where-Object { $_.status -eq 'saved' }).Count
$skippedCount = @($results | Where-Object { $_.status -eq 'skipped_existing' }).Count
$failedCount = @($results | Where-Object { $_.status -eq 'failed' }).Count

[pscustomobject]@{
  ok = ($failedCount -eq 0)
  sourceDir = $resolvedSourceDir
  outputDir = (Resolve-Path -LiteralPath $OutputDir).Path
  size = $Size
  recurse = [bool]$Recurse
  total = $videoFiles.Count
  saved = $savedCount
  skipped = $skippedCount
  failed = $failedCount
  items = $results
} | ConvertTo-Json -Depth 4
