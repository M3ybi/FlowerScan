# Real image codec fixtures

Unmodified samples from the contributors to [ianare/exif-samples](https://github.com/ianare/exif-samples), pinned at commit `5332a9cf0220e9c6c93f88a187daa90808051e10`:

| Local file | Upstream path | Purpose |
| --- | --- | --- |
| `iphone-13-pro.heic` | `heic/mobile/iphone_13_pro_max.HEIC` | Real Apple iPhone 13 Pro Max portrait HEIC, 3024 × 4032; container orientation, native/software decoding and repeat/retry |
| `iphone-export.jpg` | `jpg/hdr/iphone_hdr_NO.jpg` | Real iPhone JPEG; original metadata, decoding, JPEG normalization and server contract |
| `sample.heif` | `heic/samplefilehub.heif` | Real HEIF; format detection and software decoding |

The collection's README releases user-contributed images under Attribution-ShareAlike 4.0 International. Attribution: contributors to ianare/exif-samples; source links above. See `CC-BY-SA-4.0.txt`. No changes were made to the source image files. These public codec fixtures are only served by the isolated local test runner and are not published with the app or uploaded to the production AI service.

The JPEG sample is a real iPhone JPEG, not a capture of this user's iOS Photos export. Stale/empty MIME metadata and failed/empty streams are separate controlled boundary tests. Desktop WebKit tests do not establish physical Safari/iCloud provider behavior.
