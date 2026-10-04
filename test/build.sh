#!/bin/sh
mkdir -p site
{ printf '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>[hidden]{display:none!important}</style></head><body>'; sed 's#https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js#qrcode.js#' ../index.html; printf '</body></html>'; } > site/index.html
