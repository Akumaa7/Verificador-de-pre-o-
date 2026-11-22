#!/bin/sh
# Baixa OCR (Tesseract.js, WASM) e o modelo de português para vendor/. Precisa de internet só aqui.
set -e
cd "$(dirname "$0")/.."
mkdir -p vendor/core vendor/lang .tmp
(cd .tmp && npm init -y >/dev/null && npm i tesseract.js@5.1.1 tesseract.js-core@5.1.1)
cp .tmp/node_modules/tesseract.js/dist/tesseract.min.js .tmp/node_modules/tesseract.js/dist/worker.min.js vendor/
cp .tmp/node_modules/tesseract.js-core/tesseract-core*.js vendor/core/
cp .tmp/node_modules/tesseract.js-core/tesseract-core*.wasm vendor/core/ 2>/dev/null || true
curl -L -o vendor/lang/por.traineddata.gz https://github.com/naptha/tessdata/raw/gh-pages/4.0.0_fast/por.traineddata.gz
rm -rf .tmp
find vendor -type f ! -name files.json | sort | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(s.trim().split('\n'))))" > vendor/files.json
echo "OK: $(wc -l < vendor/files.json) arquivos em vendor/"
