#!/bin/sh
# Subsets the site's four web fonts (Google Fonts TTFs, OFL) to the characters the pages use
# and writes them as WOFF2 into assets/fonts/. Needs Python with fonttools and brotli:
#   pip install fonttools brotli
# Usage: sh tools/fonts.sh <CormorantGaramond-Medium.ttf> <EBGaramond-Italic.ttf> <EBGaramond-Regular.ttf> <EBGaramond-Medium.ttf>
# Latin + Latin Extended-A (Turkish), general punctuation, arrows (the UI's ↑ ↓), ₺, ™.
# Only kerning and standard ligatures are kept: small caps are set by hand (ui.js smallCaps).
set -e
cd "$(dirname "$0")/.."
UNI='U+0000-017F,U+2010-2027,U+2030-203A,U+2190-2193,U+20BA,U+2122'
sub() { pyftsubset "$1" --output-file="assets/fonts/$2.woff2" --flavor=woff2 --unicodes="$UNI" --layout-features='kern,liga,ccmp,locl' --no-hinting --desubroutinize; echo "$2: $(wc -c < "assets/fonts/$2.woff2") bytes"; }
sub "$1" cormorant-500
sub "$2" ebgaramond-400i
sub "$3" ebgaramond-400
sub "$4" ebgaramond-500
