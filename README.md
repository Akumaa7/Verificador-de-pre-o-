# Verificador de Preços (offline-first)

PWA sem build: HTML + ES modules. OCR local (Tesseract.js/WASM), dados em IndexedDB, nada vai para a nuvem.

## Rodar
1. `npm run vendor` (uma vez, com internet): baixa Tesseract.js, núcleo WASM e o modelo `por` para `vendor/`.
2. `npm start` e abra `http://localhost:8080` (no celular a câmera exige HTTPS ou `adb reverse tcp:8080 tcp:8080`).
3. Abra uma vez online; o service worker guarda tudo. O cabeçalho mostra "modelos locais: ok" quando o OCR está em cache.
4. Teste offline: modo avião, recarregue, fotografe uma etiqueta.

## Testes
`npm test` roda o interpretador, o comparador e o parser de cupom. Para medir com fotos reais: salve etiquetas no app, use "Exportar caso" no Histórico e coloque o JSON em `test/cases/`; `npm test` imprime a taxa de acerto de preço normal/promocional.

## Estrutura
- `src/ocr.js` motor de OCR (contrato `recognize(blob) -> {words:[{text,conf,bbox}]}`); trocar de motor não afeta o resto.
- `src/parser.js` interpretação determinística por posição, tamanho da fonte e palavras-chave.
- `src/coupon.js` itens, descontos, total e chave da NFC-e (leitura local do QR).
- `src/compare.js` associação etiqueta x item e cálculo da divergência (em centavos).
- `src/db.js` IndexedDB: `labels` (foto, OCR bruto, interpretação, final), `coupons`, `corrections` (exemplos para treino futuro).
