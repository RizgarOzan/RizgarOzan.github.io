#!/bin/sh
# Prints the two CV pages to assets/cv/ with headless Chrome (A4, sizes from cv.css @page).
cd "$(dirname "$0")"
CHROME="${CHROME:-C:/Program Files/Google/Chrome/Application/chrome.exe}"
OUT=../../assets/cv
for p in "en:Rizgar_Ozan_CV" "tr:Rizgar_Ozan_CV_TR"; do
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$(pwd)/$OUT/${p#*:}.pdf" "file:///$(pwd -W 2>/dev/null || pwd)/cv-${p%%:*}.html"
done
ls -l "$OUT"
