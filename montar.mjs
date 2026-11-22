// Gera ./manipulador-de-pdf.html (visual v3 + motor): um arquivo só, abre por file://, sem rede.
// Uso: node montar.mjs [pasta node_modules]     (padrão: ./node_modules; a pasta é só lida)
// Nome, marca e endereços: config.json. Não grava cache nem nada fora desta pasta.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const NM = process.argv[2] ?? path.join(AQUI, 'node_modules');
const { rolldown } = await import(pathToFileURL(path.join(NM, 'rolldown/dist/index.mjs')).href);
const ler = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const nm = (p) => path.join(NM, p);
const CONFIG = JSON.parse(ler(path.join(AQUI, 'config.json')));
const DESTINO = path.join(AQUI, CONFIG.arquivo);
if (path.basename(CONFIG.arquivo) !== CONFIG.arquivo) throw new Error('config.arquivo inválido');

const ICONES = `combine scissors weight layout-grid file-minus-2 rotate-cw rotate-ccw proportions image images letter-text
list-ordered tags panel-top stamp minimize-2 eraser eye cpu zap download file-pen-line check lock server-off trash-2 eye-off
shield-check code chevron-down chevron-right file-archive arrow-right arrow-left folder-open file-code-2 moon sun
search layout-dashboard x undo-2 file-text triangle-alert upload circle-check loader-circle smartphone copy monitor`.split(/\s+/);

function icone(nome) {
  const fonte = ler(nm(`lucide-react/dist/esm/icons/${nome}.js`));
  const alias = /export \{ default \} from ['"]\.\/([\w-]+)\.js['"]/.exec(fonte);
  if (alias) return icone(alias[1]);
  let svg = '';
  for (const [, tag, attrs] of fonte.slice(fonte.indexOf('createLucideIcon(')).matchAll(/\[\s*"(\w+)",\s*\{([^}]*)\}/g)) {
    const pares = [...attrs.matchAll(/"?([\w-]+)"?:\s*"([^"]*)"/g)].filter(([, k]) => k !== 'key');
    svg += `<${tag} ${pares.map(([, k, v]) => `${k}="${v}"`).join(' ')}/>`;
  }
  if (!svg) throw new Error(`ícone vazio: ${nome}`);
  return svg;
}

const aplicados = new Set();

// A fonte substituta do pdf.js aponta para uma pasta. Aqui ela sai do próprio HTML.
const embutirFontes = {
  name: 'embutir-fontes',
  transform(codigo, id) {
    if (!/pdfjs-dist[\\/]legacy[\\/]build[\\/]pdf\.mjs$/.test(id)) return null;
    const busca = 'new FontFace(loadedName, src, style)';
    if (codigo.split(busca).length !== 2) throw new Error('pdf.js mudou: trecho da fonte substituta não achado');
    const modulo = JSON.stringify(path.join(AQUI, 'src/lib/embutidos.ts'));
    aplicados.add('fontes');
    return { code: `import { srcEmbutido as __srcEmbutido } from ${modulo};
${codigo.replace(busca, 'new FontFace(loadedName, __srcEmbutido(src), style)')}`, map: null };
  },
};

// O worker do pdf.js busca JBIG2/CCITT e JPX com import() de uma pasta. Aqui eles entram no próprio worker.
// Se o pdf.js mudar esse trecho, a montagem para em vez de sair um HTML que não abre digitalização.
const embutirDecodificadores = {
  name: 'embutir-decodificadores',
  transform(codigo, id) {
    if (!/pdfjs-dist[\\/]legacy[\\/]build[\\/]pdf\.worker\.mjs$/.test(id)) return null;
    const busca = /await import\(\s*(?:\/\*[^*]*\*\/\s*)*`\$\{WasmImage\.#wasmUrl\}\$\{this\._noWasmFilename\}`\)/g;
    if ([...codigo.matchAll(busca)].length !== 1) throw new Error('pdf.js mudou: trecho dos decodificadores não achado');
    const wasm = (arquivo) => JSON.stringify(nm(`pdfjs-dist/wasm/${arquivo}`));
    const code = `import __jbig2 from ${wasm('jbig2_nowasm_fallback.js')};\nimport __openjpeg from ${wasm('openjpeg_nowasm_fallback.js')};\n`
      + codigo.replace(busca, '({ "jbig2_nowasm_fallback.js": { default: __jbig2 }, "openjpeg_nowasm_fallback.js": { default: __openjpeg } })[this._noWasmFilename]');
    aplicados.add('decodificadores');
    return { code, map: null };
  },
};

// A apresentação e a aparência usam o escopo do app: entram coladas no lugar marcado.
const colarVisual = {
  name: 'colar-visual',
  transform(codigo, id) {
    if (path.resolve(id) !== path.join(AQUI, 'src', 'app.js')) return null;
    if (codigo.split('/*VISUAL*/').length !== 2) throw new Error('marca /*VISUAL*/ não achada');
    aplicados.add('visual');
    return { code: codigo.replace('/*VISUAL*/', () => ['apresentacao.js', 'aparencia.js'].map((n) => ler(path.join(AQUI, 'src', n))).join('\n')), map: null };
  },
};

async function juntar(entrada) {
  const pacote = await rolldown({
    input: entrada,
    platform: 'browser',
    tsconfig: false,
    resolve: { alias: { '@': path.join(AQUI, 'src') }, modules: [NM], extensions: ['.ts', '.js', '.mjs', '.json'] },
    transform: { define: { 'import.meta.url': '""', 'process.env.NODE_ENV': '"production"' } },
    plugins: [colarVisual, embutirDecodificadores, embutirFontes],
    logLevel: 'silent',
  });
  const { output } = await pacote.generate({ format: 'iife', name: 'ManipuladorPdf', minify: true, codeSplitting: false });
  await pacote.close();
  if (output.length !== 1) throw new Error(`${entrada}: saiu em ${output.length} arquivos`);
  return output[0].code;
}

const [app, edicao, leitor] = await Promise.all([
  juntar(path.join(AQUI, 'src/app.js')),
  juntar(path.join(AQUI, 'src/lib/pdfEdicao.worker.ts')),
  juntar(nm('pdfjs-dist/legacy/build/pdf.worker.mjs')),
]);

if (aplicados.size !== 3) throw new Error(`ajuste de montagem não aplicado: só ${[...aplicados]}`);

const dados = {};
for (const [pasta, tipo] of [['cmaps', /\.bcmap$/], ['standard_fonts', /\.(pfb|ttf)$/]]) {
  for (const nome of fs.readdirSync(nm(`pdfjs-dist/${pasta}`)).filter((n) => tipo.test(n))) {
    dados[nome] = fs.readFileSync(nm(`pdfjs-dist/${pasta}/${nome}`)).toString('base64');
  }
}

const coreJs = /copyright: *['"]([^'"]+)['"]/.exec(ler(nm('pdfjs-dist/legacy/build/pdf.mjs')))?.[1];
if (!coreJs) throw new Error('aviso do core-js não achado');
const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
const versao = (p) => JSON.parse(ler(nm(`${p}/package.json`))).version;
const TERCEIROS = [
  [`pdf-lib ${versao('pdf-lib')}`, 'pdf-lib/LICENSE.md'],
  ['@pdf-lib/standard-fonts', '@pdf-lib/standard-fonts/LICENSE.md'],
  ['@pdf-lib/upng', '@pdf-lib/upng/LICENSE'],
  ['pako', 'pako/LICENSE'],
  ['tslib', 'tslib/LICENSE.txt'],
  [`pdf.js ${versao('pdfjs-dist')} (modificado: decodificadores embutidos no worker)`, 'pdfjs-dist/LICENSE'],
  ['CMaps da Adobe', 'pdfjs-dist/cmaps/LICENSE'],
  ['Fontes Foxit', 'pdfjs-dist/standard_fonts/LICENSE_FOXIT'],
  ['Fontes Liberation', 'pdfjs-dist/standard_fonts/LICENSE_LIBERATION'],
  ...['LICENSE_JBIG2', 'LICENSE_PDFJS_JBIG2', 'LICENSE_OPENJPEG', 'LICENSE_PDFJS_OPENJPEG'].map((n) => [`Decodificadores: ${n}`, `pdfjs-dist/wasm/${n}`]),
  ['Fonte Geist', '@fontsource-variable/geist/LICENSE'],
  [`Ícones Lucide ${versao('lucide-react')}`, 'lucide-react/LICENSE'],
];
const ofl = ler(nm('@fontsource-variable/geist/LICENSE'));
const inicioOfl = ofl.indexOf('This Font Software is licensed under');
if (inicioOfl < 0 || !ofl.includes('PERMISSION & CONDITIONS')) throw new Error('texto da OFL não achado');
const spell = /\/\*! Raios[\s\S]*?(MIT License\. Copyright[^\n]*)\n([\s\S]*?) \*\//.exec(ler(path.join(AQUI, 'src/apresentacao.js')));
if (!spell) throw new Error('aviso do Spell UI não achado');
const titulo = (nome) => `${'='.repeat(64)}\n${nome}\n${'='.repeat(64)}`;
const avisos = [
  'LICENÇAS DE TERCEIROS\nGerado por montar.mjs. Vale para o que vem dentro do HTML.',
  ...TERCEIROS.map(([nome, arq]) => `${'='.repeat(64)}\n${nome}\n${'='.repeat(64)}\n\n${ler(nm(arq)).trim()}`),
  `${'='.repeat(64)}\ncore-js (dentro da versão legacy do pdf.js)\n${'='.repeat(64)}\n\nMIT License\n${coreJs}\n\n${MIT}`,
  `${titulo('Spell UI: Light Rays e Blur Reveal (portados sem React e sem three.js)')}\n\n${spell[1]}\n\n${spell[2]}`,
  `${titulo('Fonte Instrument Serif')}\n\nCopyright 2022 The Instrument Serif Project Authors (https://github.com/Instrument/instrument-serif)\n\n${ofl.slice(inicioOfl).trim()}`,
].join('\n\n\n') + '\n';
fs.writeFileSync(path.join(AQUI, 'LICENCAS-TERCEIROS.txt'), avisos);

const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c'); // dado não pode fechar a tag script
const fonte = fs.readFileSync(nm('@fontsource-variable/geist/files/geist-latin-wght-normal.woff2')).toString('base64');
const serifa = [['Regular', 'normal'], ['Italic', 'italic']].map(([corte, estilo]) => `@font-face{font-family:"Instrument Serif";font-style:${estilo};src:url(data:font/ttf;base64,${fs.readFileSync(path.join(AQUI, `src/fontes/InstrumentSerif-${corte}.ttf`)).toString('base64')})}`).join('');
const css = `${serifa}@font-face{font-family:"Geist Variable";font-weight:100 900;src:url(data:font/woff2;base64,${fonte}) format("woff2")}
${ler(path.join(AQUI, 'src/estilo.css'))}
${ler(path.join(AQUI, 'src/temas.css'))}
${ler(path.join(AQUI, 'src/identidade.css'))}
${ler(path.join(AQUI, 'src/motor.css'))}`;
const { padrao, paletas } = JSON.parse(ler(path.join(AQUI, 'src/paletas.json')));
// Quem abriu o arquivo já tem o programa: baixar só aparece no endereço da internet (ou com ?online, para conferir).
const NA_WEB = "/^https?:$/.test(location.protocol) || new URLSearchParams(location.search).has('online')";
const script = `'use strict';const MARCA=${json(CONFIG)},NA_WEB=${NA_WEB},PADRAO=${json(padrao)},PALETAS=${json(paletas)},ICONES=${json(Object.fromEntries(ICONES.map((n) => [n, icone(n)])))};\n${app}`
  .replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '\\x3C!--').replace(/\r\n?/g, '\n');
const hash = crypto.createHash('sha256').update(script).digest('base64');

// connect-src 'none' vale também dentro dos workers (blob herda a CSP da página). script-src só aceita este script.
const csp = [
  "default-src 'none'", `script-src 'sha256-${hash}'`, 'worker-src blob:', "connect-src 'none'", "style-src 'unsafe-inline'",
  'img-src data: blob:', 'font-src data: blob:', "base-uri 'none'", "form-action 'none'",
].join('; ');
const texto = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const html = `<!doctype html>
<html lang="pt-BR" data-tema="escuro" data-paleta="${padrao}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${texto(CONFIG.nome)}</title>
<!-- Licenças de terceiros: no bloco "avisos-licenca" e no link do rodapé. -->
<style>${css}</style>
</head>
<body>
<div id="raiz"></div>
<div id="aparencia" class="aparencia" popover aria-label="Aparência"></div>
<p class="recado" id="recado" role="status" hidden></p>
<input id="escolher" type="file" hidden>
<noscript>Este programa precisa de JavaScript. Ele roda só no seu computador, sem internet.</noscript>
<script type="text/plain" id="avisos-licenca">${avisos.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '< !--')}</script>
<script type="application/json" id="workers">${json({ edicao, leitor })}</script>
<script type="application/json" id="dados">${json(dados)}</script>
<script>${script}</script>
</body>
</html>
`;
fs.writeFileSync(DESTINO, html);
console.log('HTML', (fs.statSync(DESTINO).size / 1e6).toFixed(2), 'MB', { app: app.length, edicao: edicao.length, leitor: leitor.length, arquivosDeApoio: Object.keys(dados).length });
