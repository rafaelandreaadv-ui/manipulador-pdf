// Tela do Manipulador de PDF. Quem processa é o motor em src/lib; nada sai da memória desta aba.
// ICONES, PALETAS, MARCA e NA_WEB vêm do montar.mjs. Nome, marca e endereços: só em config.json.
import { baixarArquivo, destinosDoResultado, nomeDoZip, rotuloDocumento, semExtensao, textoAceitoNoPdf } from '@/lib/ferramentas';
import { tamanhoLegivel } from '@/lib/filaPdf';
import { encerrarEdicao } from '@/lib/pdfEdicaoCliente';
import { moverItem, paginasDigitadas, planoDeDivisao } from '@/lib/pdfIntervalos';
import { abrirPdf, desenharPagina } from '@/lib/pdfLeitura';
import { executarTarefa } from '@/lib/pdfTarefas';
import { criarZip } from '@/lib/zipArmazenado';

// aqui o montar.mjs cola apresentacao.js e aparencia.js, no mesmo escopo (como no visual aprovado)
/*VISUAL*/

const GRUPOS = { org: 'Organizar páginas', con: 'Converter', mar: 'Marcar e numerar', red: 'Reduzir e proteger' };
const OPERACAO = { tamanho: 'dividirTamanho', paraimagens: 'paraImagens', marca: 'marcaDagua' };
// id, grupo, ícone, nome, frase, botão
const FERRAMENTAS = [
  ['juntar', 'org', 'combine', 'Juntar PDFs', 'Vários PDFs em um só, na ordem que você escolher.', 'Juntar agora'],
  ['dividir', 'org', 'scissors', 'Dividir ou extrair', 'Por intervalos de páginas ou a cada N páginas.', 'Dividir agora'],
  ['tamanho', 'org', 'weight', 'Dividir por tamanho', 'Partes de até N MB, para caber no envio do tribunal.', 'Dividir agora'],
  ['organizar', 'org', 'layout-grid', 'Organizar páginas', 'Reordene, gire e exclua vendo as miniaturas.', 'Salvar nova ordem'],
  ['excluir', 'org', 'file-minus-2', 'Excluir páginas', 'Digite as páginas que saem (ex.: 2, 5-7).', 'Excluir páginas'],
  ['girar', 'org', 'rotate-cw', 'Girar páginas', 'Todas ou só algumas, 90° ou 180°.', 'Girar agora'],
  ['a4', 'org', 'proportions', 'Ajustar para A4', 'Carta, ofício e outros tamanhos viram A4.', 'Ajustar para A4'],
  ['imagens', 'con', 'image', 'Imagens em PDF', 'Fotos e digitalizações JPG, PNG ou WebP em A4.', 'Criar o PDF'],
  ['paraimagens', 'con', 'images', 'PDF em imagens', 'Cada página vira uma imagem JPG ou PNG.', 'Converter agora'],
  ['texto', 'con', 'letter-text', 'PDF em texto', 'O texto do PDF num arquivo .txt, página por página.', 'Extrair o texto'],
  ['numerar', 'mar', 'list-ordered', 'Numerar páginas', 'Número em cada página, na posição que preferir.', 'Numerar agora'],
  ['documentos', 'mar', 'tags', 'Numerar documentos', '“Doc. 01”, “Doc. 02”… no alto de cada anexo.', 'Numerar documentos'],
  ['cabecalho', 'mar', 'panel-top', 'Cabeçalho e rodapé', 'Um texto seu no alto ou no pé das páginas.', 'Aplicar o texto'],
  ['marca', 'mar', 'stamp', 'Marca d’água', 'Texto em diagonal em todas as páginas (ex.: CÓPIA).', 'Aplicar a marca'],
  ['comprimir', 'red', 'minimize-2', 'Comprimir', 'Diminui fotos e digitalizações. Texto continua texto.', 'Comprimir agora'],
  ['metadados', 'red', 'eraser', 'Remover metadados', 'Apaga autor, título e programas gravados no arquivo.', 'Limpar agora'],
].map(([id, grupo, icone, nome, frase, botao]) => ({ id, grupo, icone, nome, frase, botao, operacao: OPERACAO[id] ?? id }));

const VARIOS = ['juntar', 'imagens', 'documentos'];
const POSICOES = [['superior-centro', 'No alto, no centro'], ['superior-esquerda', 'No alto, à esquerda'], ['superior-direita', 'No alto, à direita'], ['inferior-centro', 'Embaixo, no centro'], ['inferior-esquerda', 'Embaixo, à esquerda'], ['inferior-direita', 'Embaixo, à direita']];
const PAGINAS_AJUDA = 'Separe por vírgula. “8-” vai até a última página.';
// tipo, chave, rótulo, valor inicial, opções ou texto de exemplo, ajuda
const AJUSTES = {
  juntar: [['texto', 'nome', 'Nome do arquivo final', '', 'processo-completo', 'Se deixar em branco, usa o nome do primeiro PDF.']],
  dividir: [['seg', 'modo', 'Como dividir', 'intervalos', [['intervalos', 'Um por intervalo'], ['unico', 'Tudo em um'], ['blocos', 'A cada N']]],
    ['texto', 'paginas', 'Páginas', '', 'Ex.: 1-3, 5, 8-', PAGINAS_AJUDA], ['numero', 'bloco', 'De quantas em quantas páginas', '1']],
  tamanho: [['texto', 'mb', 'Máximo por parte, em MB', '5', '5', 'Veja o limite do tribunal e use um pouco menos.'], ['seg', 'mbPronto', 'Atalhos', '5', [['3', '3 MB'], ['5', '5 MB'], ['10', '10 MB']]]],
  organizar: [],
  excluir: [['texto', 'paginas', 'Páginas que saem', '', 'Ex.: 2, 5-7', PAGINAS_AJUDA]],
  girar: [['seg', 'giro', 'Quanto girar', '90', [['90', '90° à direita'], ['180', '180°'], ['270', '90° à esquerda']]],
    ['seg', 'alcance', 'Quais páginas', 'todas', [['todas', 'Todas'], ['algumas', 'Só algumas']]], ['texto', 'paginas', 'Páginas que giram', '', 'Ex.: 2, 5-7', PAGINAS_AJUDA]],
  a4: [],
  imagens: [],
  paraimagens: [['seg', 'formato', 'Formato', 'jpeg', [['jpeg', 'JPG'], ['png', 'PNG']], 'JPG fica menor. PNG não perde nitidez.'],
    ['lista', 'dpi', 'Resolução', '150', [['100', '100 dpi (leve)'], ['150', '150 dpi'], ['200', '200 dpi'], ['300', '300 dpi (impressão)']]]],
  texto: [],
  numerar: [['lista', 'posicao', 'Posição', 'inferior-direita', [['inferior-direita', 'Embaixo, à direita'], ['inferior-centro', 'Embaixo, no centro'], ['superior-direita', 'Em cima, à direita']]],
    ['lista', 'formato', 'Formato', 'pagina-n-de-t', [['pagina-n-de-t', 'Página 1 de 10'], ['n-de-t', '1/10'], ['n', '1']]], ['numero', 'inicio', 'Começar em', '1']],
  documentos: [['seg', 'rotulo', 'Rótulo', 'Doc.', [['Doc.', 'Doc. 01'], ['Documento', 'Documento 01'], ['Anexo', 'Anexo 01']]], ['numero', 'inicio', 'Começar em', '1'], ['sim', 'todas', 'Em todas as páginas', false]],
  cabecalho: [['texto', 'texto', 'Texto', '', 'Ex.: Petição e anexos', 'Até 90 caracteres.'], ['lista', 'posicao', 'Posição', 'superior-centro', POSICOES], ['sim', 'primeira', 'Só na primeira página', false]],
  marca: [['texto', 'texto', 'Texto', 'CÓPIA', '', 'Até 40 caracteres, em diagonal.'], ['seg', 'forca', 'Intensidade', '0.25', [['0.15', 'Clara'], ['0.25', 'Média'], ['0.4', 'Forte']]]],
  comprimir: [['seg', 'nivel', 'Compressão', 'equilibrada', [['equilibrada', 'Equilibrada'], ['forte', 'Forte']], 'A equilibrada serve para protocolar e ler na tela. A forte deixa a foto mais suave.'],
    ['texto', 'alvo', 'Tamanho alvo em MB (opcional)', '', 'Ex.: 10', 'Se preencher, a compressão sobe de nível, perdendo qualidade, até caber.']],
  metadados: [],
};
const NOTAS = {
  juntar: 'A ordem das miniaturas é a ordem no PDF final.',
  organizar: 'Arraste as páginas ou use os botões de cada miniatura.',
  a4: 'Página fora do A4 é redesenhada inteira e centrada. Nela, links e campos de formulário se perdem.',
  imagens: 'Cada imagem vira uma página A4, deitada quando a foto é mais larga.',
  paraimagens: 'Uma imagem por página. Se der mais de uma, elas vêm num .zip.',
  texto: 'PDF digitalizado, que é só imagem, não tem texto para extrair.',
  metadados: 'Sai título, autor, assunto, programas e datas. O conteúdo das páginas não muda.',
};

const estados = {};
const geral = { busca: '', grupo: '', sistema: /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'mac' : 'win' };
const raiz = document.querySelector('#raiz');
const escolher = document.querySelector('#escolher');
const parado = matchMedia('(prefers-reduced-motion: reduce)');
let quadro = 0, relogioRecado = 0, levando = null, rotaAnterior = null;
/** A tarefa em processamento. Uma por vez: o worker de edição é um só. */
let ocupada = null;

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const i = (nome, classe = '') => `<svg class="i ${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>`;
const atual = () => FERRAMENTAS.find((f) => location.hash === `#f/${f.id}`);
const LIMITE_MINIATURAS = 120;
const CARACTERES = 'Use letras, números e pontuação comuns: a fonte do PDF não tem emoji nem símbolo especial.';
const CLASSE_POSICAO = { superior: 'sup', inferior: 'inf', esquerda: 'esq', centro: 'cen', direita: 'dir' };
const classePosicao = (p) => p.split('-').map((x) => CLASSE_POSICAO[x]).join(' ');
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function estado(f) {
  return (estados[f.id] ??= { arquivos: [], paginas: [], op: Object.fromEntries(AJUSTES[f.id].map((a) => [a[1], a[3]])), fase: 'editar', erro: '', pct: 0, etapa: '', saidas: [], aviso: null, entrada: null, destinos: false });
}
const ordemOriginal = (total) => Array.from({ length: total }, (_, indice) => ({ indice, giro: 0, fora: false }));
const ehVarios = (f) => VARIOS.includes(f.id);

// ---------- leitura local: total de páginas e miniaturas, um PDF aberto por vez
const fichas = new Map();
let proximaFicha = 1, pedidos = [], lendo = false, aberto = null;

function ficha(arquivo) {
  if (fichas.has(arquivo)) return fichas.get(arquivo);
  const imagem = /^image\//.test(arquivo.type) || /\.(jpe?g|png|webp)$/i.test(arquivo.name);
  const m = { id: proximaFicha++, total: imagem ? 1 : null, erro: '', urls: imagem ? [URL.createObjectURL(arquivo)] : [], pedidas: new Set() };
  fichas.set(arquivo, m);
  if (!imagem) pedir(arquivo, 0);
  return m;
}

function pedir(arquivo, n) {
  pedidos.push({ arquivo, n });
  if (!lendo) void atenderPedidos();
}

async function fecharAberto() {
  const antigo = aberto;
  aberto = null;
  if (antigo) await antigo.doc.loadingTask.destroy();
}

async function atenderPedidos() {
  lendo = true;
  while (pedidos.length) {
    const { arquivo, n } = pedidos.shift();
    const m = fichas.get(arquivo);
    if (!m || m.erro) continue;
    try {
      if (aberto?.arquivo !== arquivo) {
        await fecharAberto();
        aberto = { arquivo, doc: await abrirPdf(new Uint8Array(await arquivo.arrayBuffer()), arquivo.name) };
      }
      if (fichas.get(arquivo) !== m) continue;
      if (!n) { m.total = aberto.doc.numPages; chegouTotal(arquivo); continue; }
      const { blob } = await desenharPagina(aberto.doc, n, { larguraAlvo: 200, tipo: 'image/jpeg', intent: 'display' });
      if (fichas.get(arquivo) !== m) continue;
      m.urls[n - 1] = URL.createObjectURL(blob);
      for (const papel of raiz.querySelectorAll(`[data-ficha="${m.id}"][data-pagina="${n}"]`)) {
        papel.querySelectorAll('u').forEach((u) => u.remove());
        papel.classList.add('real');
        papel.insertAdjacentHTML('afterbegin', `<img src="${m.urls[n - 1]}" alt="" draggable="false">`);
        papel.removeAttribute('data-ficha');
      }
    } catch (e) {
      if (n) continue; // miniatura que falha fica em branco; a tarefa dá o erro, se houver
      m.erro = mensagemDe(e, arquivo.name);
      chegouTotal(arquivo);
    }
  }
  if (aberto && !fichas.has(aberto.arquivo)) await fecharAberto();
  lendo = false;
  if (pedidos.length) void atenderPedidos();
}

function chegouTotal(arquivo) {
  const f = atual();
  for (const g of FERRAMENTAS) {
    const s = estados[g.id];
    if (!s?.arquivos.includes(arquivo)) continue;
    if (!ehVarios(g)) s.paginas = ordemOriginal(fichas.get(arquivo).total ?? 0);
    if (g === f && s.fase === 'editar') desenha();
  }
}

/** Arquivo que saiu de todas as ferramentas sai da memória junto com as miniaturas. */
function soltarArquivos() {
  const usados = new Set(Object.values(estados).flatMap((s) => s.arquivos));
  for (const [arquivo, m] of fichas) {
    if (usados.has(arquivo)) continue;
    m.urls.forEach((u) => u && URL.revokeObjectURL(u));
    fichas.delete(arquivo);
  }
  pedidos = pedidos.filter((p) => fichas.has(p.arquivo));
  if (!lendo && aberto && !fichas.has(aberto.arquivo)) void fecharAberto();
}

const visiveis = new IntersectionObserver((entradas) => {
  for (const { isIntersecting, target } of entradas) {
    if (!isIntersecting) continue;
    visiveis.unobserve(target);
    const n = Number(target.dataset.pagina);
    for (const [arquivo, m] of fichas) {
      if (String(m.id) !== target.dataset.ficha || m.pedidas.has(n)) continue;
      m.pedidas.add(n);
      pedir(arquivo, n);
    }
  }
}, { rootMargin: '300px' });

function observarMiniaturas() {
  visiveis.disconnect();
  raiz.querySelectorAll('[data-ficha]').forEach((el) => visiveis.observe(el));
}

function mensagemDe(e, nome) {
  if (e instanceof DOMException && e.name === 'NotReadableError') return `Não consegui ler "${nome}". Ele pode ter mudado de lugar. Escolha o arquivo de novo.`;
  if (e instanceof RangeError) return 'O arquivo é grande demais para a memória deste navegador. Divida antes ou feche outras abas.';
  return e instanceof Error ? e.message : 'Algo deu errado no processamento.';
}

function numeroDaPagina(formato, n, ultimo) {
  return formato === 'n' ? String(n) : formato === 'n-de-t' ? `${n}/${ultimo}` : `Página ${n} de ${ultimo}`;
}

// ---------- validação e tarefa
function oQueFalta(f, s) {
  const o = s.op, n = s.arquivos.length;
  const falta = (texto) => ({ texto }), mal = (texto) => ({ texto, mal: true });
  if (!n) return falta(f.id === 'imagens' ? 'Escolha as imagens.' : ehVarios(f) ? 'Escolha os PDFs.' : 'Escolha o PDF.');
  if (f.id === 'juntar' && n < 2) return falta('Escolha pelo menos 2 PDFs.');
  const lidas = s.arquivos.map(ficha);
  if (lidas.some((m) => m.erro)) return mal(ehVarios(f) ? 'Tire o arquivo com erro para continuar.' : 'Não deu para ler este PDF.');
  if (lidas.some((m) => m.total === null)) return falta('Lendo o PDF…');
  const total = lidas[0].total;
  if (f.id === 'dividir') {
    if (o.modo !== 'blocos' && !o.paginas.trim()) return falta('Informe as páginas.');
    const plano = planoDeDivisao(o.modo, o.paginas, o.bloco, total);
    if ('erro' in plano) return mal(plano.erro);
  }
  if (f.id === 'excluir' || (f.id === 'girar' && o.alcance === 'algumas')) {
    if (!o.paginas.trim()) return falta('Informe as páginas.');
    const r = paginasDigitadas(o.paginas, total);
    if ('erro' in r) return mal(r.erro);
    if (f.id === 'excluir' && r.paginas.length === total) return mal('Não sobraria nenhuma página. Deixe ao menos uma.');
  }
  if (f.id === 'tamanho') {
    const mb = Number(o.mb.replace(',', '.'));
    if (!(mb >= 0.5 && mb <= 500)) return mal('Use um valor entre 0,5 e 500 MB.');
  }
  if (f.id === 'comprimir' && o.alvo.trim()) {
    const mb = Number(o.alvo.replace(',', '.'));
    if (!(mb >= 0.1 && mb <= 2000)) return mal('Tamanho alvo: use um valor entre 0,1 e 2000 MB, ou deixe em branco.');
  }
  if ('inicio' in o) {
    const maximo = f.id === 'documentos' ? 999 : 99999, v = Number(o.inicio);
    if (!(Number.isInteger(v) && v >= 1 && v <= maximo)) return mal(`O primeiro número vai de 1 a ${maximo}.`);
  }
  if ('texto' in o) {
    if (!o.texto.trim()) return falta('Escreva o texto.');
    if (!textoAceitoNoPdf(o.texto.trim())) return mal(CARACTERES);
  }
  if (f.id === 'organizar') {
    if (s.paginas.every((p) => p.fora)) return mal('Deixe ao menos uma página.');
    if (!s.paginas.some((p, k) => p.indice !== k || p.giro || p.fora)) return falta('Mude a ordem, gire ou exclua alguma página.');
  }
  if (ocupada) return falta(`Espere terminar: ${ocupada.f.nome}.`);
  return null;
}

function entradaDe(f, s) {
  const o = s.op, operacao = f.operacao, [arquivo] = s.arquivos, total = ficha(arquivo).total;
  if (ehVarios(f)) {
    const base = { operacao, arquivos: [...s.arquivos] };
    return f.id === 'documentos' ? { ...base, rotulo: o.rotulo, inicio: Number(o.inicio), todasPaginas: o.todas } : base;
  }
  const proprios = {
    dividir: () => ({ grupos: planoDeDivisao(o.modo, o.paginas, o.bloco, total).grupos, umArquivo: o.modo === 'unico' }),
    tamanho: () => ({ limiteMb: Number(o.mb.replace(',', '.')) }),
    organizar: () => ({ paginas: s.paginas.filter((p) => !p.fora).map(({ indice, giro }) => ({ indice, giro })) }),
    excluir: () => ({ paginas: paginasDigitadas(o.paginas, total).paginas }),
    girar: () => ({ giro: Number(o.giro), paginas: o.alcance === 'todas' ? null : paginasDigitadas(o.paginas, total).paginas }),
    paraimagens: () => ({ formato: o.formato, dpi: Number(o.dpi) }),
    numerar: () => ({ posicao: o.posicao, formato: o.formato, inicio: Number(o.inicio) }),
    cabecalho: () => ({ texto: o.texto.trim(), posicao: o.posicao, soPrimeira: o.primeira }),
    marca: () => ({ texto: o.texto.trim(), opacidade: Number(o.forca) }),
    comprimir: () => ({ nivel: o.nivel, alvoMb: o.alvo.trim() ? Number(o.alvo.replace(',', '.')) : null }),
  };
  return { operacao, arquivo, ...proprios[f.id]?.() };
}

// ---------- apresentação ----------
const marca = () => `<a class="marca" href="#inicio"><span class="chip-ico">${i('cpu')}</span><span><b>${MARCA.nome}</b><small>${MARCA.frase}</small></span></a>`;
const usar = (texto = 'Usar a ferramenta', g = '') => `<a class="btn-luz ${g}" href="#ferramentas">${i('zap')}<span>${texto}</span></a>`;
const barra = (onde) => `<header class="barra">${marca()}<nav aria-label="Seções">${onde === 'inicio'
  ? '<button class="so-largo" data-rolar="como">Como funciona</button><button class="so-largo" data-rolar="privacidade">Privacidade</button>' + (NA_WEB ? '<a href="#baixar">Baixar</a>' : '')
  : '<a href="#inicio">Apresentação</a>' + (NA_WEB ? `<a href="#baixar" ${onde === 'baixar' ? 'aria-current="page"' : ''}>Como baixar</a>` : '')}</nav><div class="fim">${botaoAparencia()}${usar('Usar agora')}</div></header>`;
const fundo = '<div class="pontos" aria-hidden="true"></div><div class="halo a" aria-hidden="true"></div><div class="halo b" aria-hidden="true"></div>';
const chip = (icone = 'cpu', rotulo = '', classe = '') => `<div class="chip ${classe}"><span class="giro"></span>${i(icone)}${rotulo ? `<b>${rotulo}</b>` : ''}</div>`;
const externo = ([texto, url]) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${texto}</a>`;
const creditos = () => `<span>${MARCA.autor} · ${externo(MARCA.instagram)}</span><span>${MARCA.erp[0]}: ${externo(MARCA.erp.slice(1))}</span>`;
const rodapeSite = () => `<footer class="rodape-site"><p class="creditos">${creditos()}</p><p>${MARCA.nome} · funciona sem internet · <a href="#licencas">Licenças de terceiros</a></p></footer>`;
const ICP = `<p class="aviso-ambar">${i('file-pen-line')}<span><b>Assinatura digital:</b> o PDF gerado é um arquivo novo, e a assinatura ICP-Brasil do original não vale nele. Vai protocolar documento assinado? Use o original ou assine de novo depois de editar.</span></p>`;

const ENTRADAS = [['peticao.pdf', '12 páginas'], ['procuracao.pdf', '2 páginas'], ['documentos.pdf', '38 páginas']];
const SAIDAS = [['processo-completo.pdf', 'tudo num arquivo', 'juntado'], ['processo-leve.pdf', '35,8 MB → 23,6 MB', '−34%'], ['anexos.pdf', 'numerados', 'Doc. 01…03']];
const YS = [80, 190, 300];
const encosto = (y) => 190 + (y - 190) * 0.28;
const CAMINHOS = [...YS.map((y) => `M200 ${y} C310 ${y},310 ${encosto(y)},430 ${encosto(y)}`), ...YS.map((y) => `M570 ${encosto(y)} C690 ${encosto(y)},690 ${y},800 ${y}`)];

function diagrama() {
  const cartao = ([nome, detalhe, selo], k, x) => {
    const largura = selo ? selo.length * 7 + 16 : 0;
    return `<g class="cartao" data-aceso="false" transform="translate(${x} ${YS[k] - 29})"><rect class="caixa" width="190" height="58" rx="14"/><rect class="folha" x="12" y="11" width="26" height="34" rx="5"/><text class="sigla" x="15" y="41">PDF</text><text class="n" x="48" y="25">${nome}</text><text class="d" x="48" y="42">${detalhe}</text>${selo
      ? `<g transform="translate(${184 - largura} -11)"><g class="selo"><rect width="${largura}" height="22" rx="11"/><text x="${largura / 2}" y="15" text-anchor="middle">${selo}</text></g></g>` : ''}</g>`;
  };
  return `<div class="diagrama" aria-hidden="true"><svg viewBox="0 0 1000 380" fill="none">
    <defs><linearGradient id="energia" gradientUnits="userSpaceOnUse" x1="200" x2="800"><stop offset="0" style="stop-color:var(--linha-luz)"/><stop offset="1" style="stop-color:var(--linha-luz2)"/></linearGradient>
    <filter id="brilho" filterUnits="userSpaceOnUse" x="0" y="0" width="1000" height="380"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    ${CAMINHOS.map((d) => `<path class="trilha" d="${d}"/>`).join('')}
    ${CAMINHOS.map((d) => `<path class="energia" d="${d}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" stroke-width="2.5" stroke="url(#energia)" filter="url(#brilho)"/>`).join('')}
    ${CAMINHOS.map(() => '<circle class="cabeca" r="5" style="fill:var(--linha-luz2)" opacity="0" filter="url(#brilho)"/>').join('')}
    ${ENTRADAS.map((c, k) => cartao(c, k, 10)).join('')}${SAIDAS.map((c, k) => cartao(c, k, 800)).join('')}</svg>
    <div class="chip-lugar"><span class="onda"></span><span class="onda"></span><div class="chip" data-aceso="false"><span class="giro"></span>${i('cpu')}<b>Seu computador</b><div class="pista"><i></i></div></div></div>
    <p class="pe" style="left:1%">Seus arquivos</p><p class="pe" style="left:80%">Pronto para salvar</p></div>
  <div class="diagrama-v" aria-hidden="true">
    <div class="fila"><span class="arqv">petição</span><span class="arqv">procuração</span><span class="arqv">anexos</span></div>
    <svg class="fios" viewBox="0 0 300 50" fill="none" style="stroke:var(--linha-luz)" stroke-width="2"><path d="M48 0C48 34 126 18 126 50M150 0V50M252 0C252 34 174 18 174 50"/></svg>
    ${chip('cpu', 'Seu computador')}
    <svg class="fios" viewBox="0 0 300 50" fill="none" style="stroke:var(--linha-luz2)" stroke-width="2"><path d="M126 0C126 32 48 16 48 50M150 0V50M174 0C174 32 252 16 252 50"/></svg>
    <div class="fila"><span class="arqv">juntado</span><span class="arqv">mais leve</span><span class="arqv">numerado</span></div></div>`;
}

// Linha do tempo do diagrama: a luz entra, o chip processa e os resultados acendem.
function animarDiagrama() {
  cancelAnimationFrame(quadro);
  const d = raiz.querySelector('.diagrama');
  if (!d) return;
  const trilhas = [...d.querySelectorAll('.energia')], cabecas = [...d.querySelectorAll('.cabeca')], cartoes = [...d.querySelectorAll('.cartao')];
  const oChip = d.querySelector('.chip'), pista = d.querySelector('.pista i'), ondas = [...d.querySelectorAll('.onda')];
  const limite = (v) => Math.min(1, Math.max(0, v)), suave = (v) => 1 - (1 - v) ** 3;
  let ultima = '';
  const pintar = (t) => {
    const c = t % 7600, apagando = Math.max(0, (c - 5600) / 900);
    trilhas.forEach((p, k) => {
      const sai = k > 2, n = k % 3;
      const fr = suave(limite((c - (sai ? 3200 + n * 200 : n * 220)) / (sai ? 1200 : 1250)));
      p.style.strokeDashoffset = 1 - fr;
      p.style.opacity = Math.max(0.25, 1 - apagando);
      cartoes[k].dataset.aceso = sai ? fr >= 1 : c > n * 220 && c < 5600;
      cabecas[k].style.opacity = fr > 0 && fr < 1 ? 1 : 0;
      if (fr > 0 && fr < 1) { const q = p.getPointAtLength(p.getTotalLength() * fr); cabecas[k].setAttribute('cx', q.x); cabecas[k].setAttribute('cy', q.y); }
    });
    oChip.dataset.aceso = c > 1450 && c < 3600;
    pista.style.transform = `scaleX(${limite((c - 1700) / 1500) * (1 - limite(apagando))})`;
    const chave = `${Math.floor(t / 7600)}:${c >= 1450}`;
    if (chave !== ultima && c >= 1450 && !parado.matches) ondas.forEach((o, k) => o.animate([{ transform: 'scale(1)', opacity: 0.8 }, { transform: 'scale(2.1)', opacity: 0 }], { duration: 1100, delay: k * 160, easing: 'ease-out' }));
    ultima = chave;
  };
  if (parado.matches) return pintar(5200);
  const inicio = performance.now();
  const passo = (agora) => { pintar(Math.max(0, agora - inicio)); quadro = requestAnimationFrame(passo); };
  quadro = requestAnimationFrame(passo);
}

function telaInicio() {
  const passo = (n, titulo, texto, mini, classe = '') => `<li class="passo"><span class="num">${n}</span><h3>${titulo}</h3><p>${texto}</p><div class="mini ${classe}" aria-hidden="true">${mini}</div></li>`;
  const garantia = (icone, titulo, texto) => `<li><span class="q">${i(icone)}</span><h3>${titulo}</h3><p>${texto}</p></li>`;
  return `<div class="site">${fundo}${barra('inicio')}<main>
  <section class="hero">
    ${luzes(true)}
    <p class="linhas">Ferramenta local · nada sai daqui</p>
    <h1 tabindex="-1"><span class="um">${revelar('Seus PDFs ficam com', 'você.', 650)}</span> <span class="segunda"><span class="dois">Tudo acontece no seu computador.</span>${PONTA}</span></h1>
    <p class="chamada">Junte, divida, organize, comprima e converta. Sem cadastro, sem instalar nada e sem subir documento para site nenhum.</p>
    <div class="acoes">${usar('Usar a ferramenta', 'g')}${NA_WEB ? `<a class="btn-vidro" href="#baixar">${i('download')}Baixar pra usar sem internet</a>` : ''}</div>
    ${cena()}
  </section>
  <section class="prova">
    <dl class="numeros"><div><dt>ferramentas</dt><dd>16</dd></div><div><dt>arquivos enviados</dt><dd>0</dd></div><div><dt>no seu computador</dt><dd>100%</dd></div></dl>
    ${diagrama()}
  </section>
  <section class="secao" id="como">
    <p class="olho">Como funciona</p><h2>Três passos. <em>Nenhum upload.</em>${PONTA}</h2>
    <p class="lead">O programa inteiro vem dentro de um arquivo. Você abre no navegador e o PDF é mexido ali mesmo, na memória do seu computador.</p>
    <ol class="passos">
      ${passo(1, 'Escolha a ferramenta e os arquivos', 'Arraste os PDFs ou clique para escolher. Pode desligar a internet, se quiser.', '<span class="pdfzinho"></span><span class="pdfzinho"></span><span class="pdfzinho"></span>')}
      ${passo(2, 'Seu computador faz o trabalho', 'A tarefa roda na própria aba. É só não fechar até terminar.', `${i('cpu')}<span class="pista"><i></i></span>`, 'proc')}
      ${passo(3, 'Salve ou use em outra ferramenta', 'O resultado já pode seguir para a próxima. Juntou e ficou pesado? Comprime.', `<span class="bola">${i('check')}</span>pronto para salvar`, 'ok')}
    </ol>${ICP}
  </section>
  <section class="secao" id="privacidade">
    <p class="olho">Privacidade e LGPD</p><h2>O sigilo do processo começa por <em>não enviar o arquivo.</em>${PONTA}</h2>
    <p class="lead">Petição, laudo, documento de cliente: nada passa por servidor. Só lembre de salvar o resultado antes de fechar a aba.</p>
    <div class="priv">
      <div class="escudo" aria-hidden="true"><i class="r1"></i><i class="r2"></i><i class="r3"></i><i class="orbita"></i><span class="centro">${i('lock')}</span></div>
      <ul class="garantias">
        ${garantia('server-off', 'Nada é enviado', 'O arquivo HTML vem com a conexão bloqueada. Nem o nome do documento sai.')}
        ${garantia('trash-2', 'Tudo some ao fechar', 'Fechou a aba, os arquivos e os resultados saem da memória.')}
        ${garantia('eye-off', 'Sem rastro', 'Sem conta, histórico ou estatística. O navegador só guarda a cor que você escolheu.')}
        ${garantia('shield-check', 'LGPD na prática', 'Necessidade e segurança (arts. 6º, III, e 46): o dado fica sob o seu controle.')}
      </ul></div>
  </section>
  <div class="final"><div><h2>Bora tirar esse PDF <em>da frente?</em>${PONTA}</h2><p>São 16 ferramentas para o dia a dia, do limite do tribunal à numeração dos anexos.</p><div class="acoes">${usar('Usar a ferramenta', 'g')}${NA_WEB ? `<a class="btn-vidro" href="#baixar">${i('download')}Baixar pra usar sem internet</a>` : ''}</div></div></div>
  </main>${rodapeSite()}</div>`;
}

function telaLicencas() {
  return `<div class="site">${luzes(false)}${fundo}${barra('licencas')}<main class="secao baixar">
    <h1 class="titulo-site" tabindex="-1">Licenças <em>de terceiros</em>${PONTA}</h1>
    <p class="lead">Bibliotecas, fontes, efeitos e ícones que vêm dentro deste arquivo.</p>
    <pre class="licencas" tabindex="0">${esc(document.querySelector('#avisos-licenca').textContent)}</pre></main>${rodapeSite()}</div>`;
}

// ---------- programa ----------
function casca(f, miolo) {
  const item = (href, icone, nome, aqui, fim = '') => `<a class="it" href="${href}" ${aqui ? 'aria-current="page"' : ''}>${i(icone)}<span>${nome}</span>${fim}</a>`;
  return `<div class="app"><aside class="lado">${marca()}
    <nav class="menu" aria-label="Ferramentas">${item('#ferramentas', 'layout-dashboard', 'Todas as ferramentas', !f, '<small>16</small>')}
      ${Object.entries(GRUPOS).map(([g, nome]) => `<h2>${nome}</h2>${FERRAMENTAS.filter((x) => x.grupo === g).map((x) => item(`#f/${x.id}`, x.icone, x.nome, x === f)).join('')}`).join('')}</nav>
    <div class="base">${NA_WEB ? item('#baixar', 'download', 'Baixar pra usar sem internet', false) : ''}<p class="local"><span class="ponto"></span>Não usa internet</p></div></aside>
  <div class="principal"><header class="topo-app">
    <a class="celular" href="${f ? '#ferramentas' : '#inicio'}"><span class="chip-ico">${i(f ? 'arrow-left' : 'cpu')}</span>${f ? 'Ferramentas' : MARCA.nome}</a>
    <nav class="trilha-nav" aria-label="Trilha"><a href="#inicio">${MARCA.nome}</a>${i('chevron-right')}${f ? `<a href="#ferramentas">Ferramentas</a>${i('chevron-right')}<span aria-current="page">${f.nome}</span>` : '<span aria-current="page">Ferramentas</span>'}</nav>
    <div class="fim">${botaoAparencia()}<button class="redondo" id="tema" data-tema-troca aria-label="Trocar entre claro e escuro">${i(document.documentElement.dataset.tema === 'claro' ? 'moon' : 'sun')}</button></div>
  </header>${miolo}<footer class="creditos rodape-app">${creditos()}</footer></div></div>`;
}

function listaFerramentas() {
  const limpa = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const termo = limpa(geral.busca.trim());
  const visiveis = FERRAMENTAS.filter((f) => (!geral.grupo || f.grupo === geral.grupo) && limpa(`${f.nome} ${f.frase}`).includes(termo));
  if (!visiveis.length) return `<div class="nada" role="status">${i('search')}<b>Não achei ferramenta com esse nome.</b><button class="btn sec p" id="limpar" data-limpar>Ver todas</button></div>`;
  return Object.entries(GRUPOS).map(([g, nome]) => {
    const lista = visiveis.filter((f) => f.grupo === g);
    return lista.length ? `<section class="grupo"><h2>${nome}</h2><ul class="cartoes">${lista.map((f) => `<li><a class="op" href="#f/${f.id}"><span class="quad">${i(f.icone)}</span><h3>${f.nome}</h3><p>${f.frase}</p><span class="abrir">Abrir ${i('arrow-right')}</span></a></li>`).join('')}</ul></section>` : '';
  }).join('');
}

function telaFerramentas() {
  return casca(null, `<main class="conteudo"><div class="cab"><div><h1 tabindex="-1">O que você quer fazer com <em>seus PDFs?</em>${PONTA}</h1><p>Escolhe uma. Dá para emendar uma ferramenta na outra.</p></div>
      <label class="busca">${i('search')}<span class="sr">Buscar ferramenta</span><input id="busca" type="search" value="${esc(geral.busca)}" placeholder="Buscar ferramenta" autocomplete="off"></label></div>
    <p class="faixa-local"><span class="ponto"></span>${i('shield-check')}<span>Tudo local: nenhum arquivo sai deste computador.</span></p>
    <div class="filtros" role="group" aria-label="Filtrar por grupo">${[['', 'Todas'], ...Object.entries(GRUPOS)].map(([g, nome]) => `<button id="grupo-${g}" data-grupo="${g}" aria-pressed="${geral.grupo === g}">${nome}</button>`).join('')}</div>
    <div id="lista">${listaFerramentas()}</div></main>`);
}

function campo(s, [tipo, chave, rotulo, , opcoes, ajuda]) {
  if (chave === 'bloco' && s.op.modo !== 'blocos') return '';
  if (chave === 'paginas' && (s.op.modo === 'blocos' || s.op.alcance === 'todas')) return '';
  const v = s.op[chave], id = `campo-${chave}`, pe = ajuda ? `<small>${ajuda}</small>` : '';
  if (tipo === 'sim') return `<label class="campo marcar"><input id="${id}" data-campo="${chave}" type="checkbox" ${v ? 'checked' : ''}>${rotulo}</label>`;
  if (tipo === 'seg') return `<div class="campo"><span class="r">${rotulo}</span><div class="segmento" role="group" aria-label="${rotulo}">${opcoes.map(([valor, nome], k) => `<button id="${id}-${k}" data-opcao="${chave}" data-valor="${valor}" aria-pressed="${v === valor}">${nome}</button>`).join('')}</div>${pe}</div>`;
  const entrada = tipo === 'lista'
    ? `<select class="entrada" id="${id}" data-campo="${chave}">${opcoes.map(([valor, nome]) => `<option value="${valor}" ${v === valor ? 'selected' : ''}>${nome}</option>`).join('')}</select>`
    : `<input class="entrada" id="${id}" data-campo="${chave}" ${tipo === 'numero' ? `type="number" min="1" max="${'rotulo' in s.op ? 999 : 99999}"` : 'type="text"'} maxlength="${chave === 'texto' && 'forca' in s.op ? 40 : 90}" value="${esc(v)}" placeholder="${esc(opcoes ?? '')}" autocomplete="off">`;
  return `<label class="campo"><span class="r">${rotulo}</span>${entrada}${pe}</label>`;
}

function miniaturas(f, s) {
  const varios = ehVarios(f), o = s.op;
  if (!varios && (!s.arquivos.length || !ficha(s.arquivos[0]).total)) return '';
  let itens = varios ? s.arquivos : s.paginas;
  const total = itens.length;
  // shortcut: prévia só das 120 primeiras páginas (menos em Organizar), virtualizar se alguém precisar ver todas
  if (!varios && f.id !== 'organizar') itens = itens.slice(0, LIMITE_MINIATURAS);
  let marcadas = null;
  if (f.id === 'excluir' || (f.id === 'girar' && o.alcance === 'algumas')) {
    const r = paginasDigitadas(o.paginas, total);
    if (!('erro' in r)) marcadas = new Set(r.paginas);
  }
  const inicio = Number.isInteger(Number(o.inicio)) && Number(o.inicio) >= 1 ? Number(o.inicio) : 1;
  let mantidas = 0;
  return itens.map((item, k) => {
    const n = varios ? k + 1 : item.indice + 1;
    const arquivo = varios ? item : s.arquivos[0], pagina = varios ? 1 : n, m = ficha(arquivo);
    const fora = f.id === 'organizar' ? item.fora : f.id === 'excluir' && !!marcadas?.has(n - 1);
    if (!fora) mantidas++;
    let giro = f.id === 'organizar' ? item.giro : 0, extra = '';
    if (f.id === 'girar' && (o.alcance === 'todas' || marcadas?.has(n - 1))) giro = Number(o.giro);
    if (f.id === 'marca') extra = `<span class="agua" style="opacity:${o.forca};font-size:${Math.min(19, 108 / Math.max(4, o.texto.length))}cqw">${esc(o.texto)}</span>`;
    if (f.id === 'cabecalho' && o.texto.trim() && (!o.primeira || !k)) extra = `<span class="carimbo ${classePosicao(o.posicao)}">${esc(o.texto)}</span>`;
    if (f.id === 'numerar') extra = `<span class="carimbo ${classePosicao(o.posicao)}">${numeroDaPagina(o.formato, k + inicio, total + inicio - 1)}</span>`;
    if (f.id === 'documentos') extra = `<span class="carimbo sup dir">${rotuloDocumento(o.rotulo, k + inicio)}</span>`;
    const url = m.urls[pagina - 1];
    const papel = m.erro ? i('triangle-alert', 'ruim') : url ? `<img src="${url}" alt="" draggable="false">` : '<u></u>'.repeat(12);
    const esperando = !m.erro && !url && m.total !== null ? `data-ficha="${m.id}" data-pagina="${pagina}"` : '';
    let legenda = varios ? `<b>${n}.</b> ${esc(item.name)}` : `<b>${f.id === 'organizar' ? mantidas : n}</b>${f.id === 'organizar' && mantidas !== n ? ` · era a ${n}` : ''}`;
    if (fora) legenda = '<span class="saiu">Excluída</span>';
    const detalhe = varios ? `<p class="leg det">${m.erro ? '<span class="saiu">não abriu</span>' : f.id === 'imagens' ? tamanhoLegivel(item.size) : m.total === null ? 'lendo…' : plural(m.total, 'página', 'páginas')}</p>` : '';
    const b = (acao, icone, texto, travado = false) => `<button id="${acao}-${k}" data-acao="${acao}" data-k="${k}" aria-label="${texto} ${n}" ${travado ? 'disabled' : ''}>${i(icone)}</button>`;
    const mover = [b('antes', 'arrow-left', 'Mover para antes o item', !k), b('depois', 'arrow-right', 'Mover para depois o item', k === itens.length - 1)].join('');
    const botoes = varios ? mover + b('tirar', 'x', 'Tirar o arquivo')
      : f.id === 'organizar' ? b('esquerda', 'rotate-ccw', 'Girar à esquerda a página') + b('direita', 'rotate-cw', 'Girar à direita a página') + mover + b('fora', fora ? 'undo-2' : 'trash-2', fora ? 'Devolver a página' : 'Excluir a página') : '';
    const deitada = giro % 180 !== 0;
    return `<li ${botoes ? `draggable="true" data-item="${k}"` : ''}><div class="mini-pg ${fora ? 'fora' : ''}">
      <div class="vista" aria-hidden="true"><div class="papel ${url && !m.erro ? 'real' : ''}" ${esperando} style="rotate:${giro}deg;scale:${deitada ? 0.76 : 0.96}">${papel}${extra}</div></div>
      <p class="leg" title="${varios ? esc(item.name) : ''}">${legenda}</p>${detalhe}${botoes ? `<div class="ferr-pg">${botoes}</div>` : ''}</div></li>`;
  }).join('');
}

const PROXIMO_NIVEL = {
  forte: 'fotos mais suaves',
  mais110: 'fotos em cerca de 110 dpi, perdem nitidez',
  mais72: 'fotos em cerca de 72 dpi, perdem bastante nitidez',
  raster110: 'cada página vira imagem (110 dpi): o texto não pode mais ser selecionado nem buscado',
  raster72: 'cada página vira imagem (72 dpi): sem seleção de texto e leitura mais difícil',
};

// Pouco ganho, ou arquivo que já saiu daqui comprimido: dividir antes de sacrificar a qualidade.
function caixaComprimirMais(f, s) {
  const c = f.id === 'comprimir' && s.compressao;
  if (!c) return '';
  const fraco = c.jaComprimido || c.ganho < 0.4;
  if (!fraco && !c.proximo) return '';
  const mais = c.proximo ? `<button class="btn-vidro" id="comprimir-mais" data-mais>${i('minimize-2')}Comprimir mais${fraco ? ' mesmo assim' : ''}</button>` : '';
  return `<div class="aviso-ambar" id="comprimir-mais-caixa">${i('triangle-alert')}<span>${fraco ? '<b>Este arquivo já está comprimido.</b> Para ficar menor sem perder qualidade, o melhor é dividir. ' : ''}${c.proximo ? `Comprimir mais: ${PROXIMO_NIVEL[c.proximo]}.` : 'Já está no nível mais forte.'}</span></div>
    <div class="acoes">${fraco ? `<button class="btn-vidro" id="ir-dividir" data-dividir>${i('scissors')}Dividir</button>` : ''}${mais}</div>`;
}

function esquerda(f, s) {
  const frase = `<p class="desc">${f.frase}</p>`;
  if (s.fase === 'fazendo') return `${frase}<div class="estado" id="fazendo" role="status">${chip('cpu')}<h2>Mexendo no seu PDF</h2><p>Tudo aqui no seu computador. É só não fechar esta aba.</p>
    <div class="progresso"><div class="pista"><i id="barra" style="transform:scaleX(${Math.max(0.04, s.pct / 100)})"></i></div><small id="pct">${s.pct}%</small><small id="etapa">${esc(s.etapa)}</small></div>
    <div class="acoes"><button class="btn-vidro" id="cancelar" data-cancelar>${i('x')}Cancelar</button></div></div>`;
  if (s.fase === 'pronto') {
    const n = s.saidas.length, bytes = s.saidas.reduce((t, x) => t + x.blob.size, 0);
    const destinos = destinosDoResultado(s.saidas, f.operacao).map((op) => FERRAMENTAS.find((g) => g.operacao === op));
    return `${frase}<div class="estado" id="pronto" role="status">${chip(n ? 'check' : 'shield-check', '', n ? 'feito' : '')}<h2>${n ? `Pronto. E <em>nada saiu daqui.</em>${PONTA}` : `Não precisou <em>mexer.</em>${PONTA}`}</h2>
    ${n ? `<div class="saida">${i(n > 1 ? 'file-archive' : 'file-text')}<div><b>${esc(n > 1 ? nomeDoZip(s.entrada) : s.saidas[0].nome)}</b><small>${n > 1 ? `${plural(n, 'arquivo', 'arquivos')} · ` : ''}${tamanhoLegivel(bytes)}</small></div></div>` : ''}
    ${s.aviso ? `<p class="aviso-res" id="aviso">${esc(s.aviso)}</p>` : ''}
    ${caixaComprimirMais(f, s)}
    <div class="acoes">${n ? `<button class="btn-luz" id="salvar" data-salvar>${i('download')}<span>${n > 1 ? 'Salvar tudo em ZIP' : 'Salvar arquivo'}</span></button>` : ''}
      ${destinos.length ? `<button class="btn-vidro" id="outra" data-outra aria-expanded="${s.destinos}">${i('arrow-right')}Usar em outra</button>` : ''}
      <button class="btn-vidro" id="de-novo" data-de-novo>Fazer de novo</button></div>
    ${s.destinos ? `<ul class="destinos" id="destinos">${destinos.map((g) => `<li><button id="destino-${g.id}" data-destino="${g.id}">${i(g.icone)}${g.nome}</button></li>`).join('')}</ul>` : ''}
    ${n > 1 ? `<ul class="saidas">${s.saidas.map((x, k) => `<li><button id="uma-${k}" data-uma="${k}">${i('download')}<span>${esc(x.nome)}</span><small>${tamanhoLegivel(x.blob.size)}</small></button></li>`).join('')}</ul>` : ''}
    ${n ? '<p class="icp">Se o original tinha assinatura ICP-Brasil, ela não vale no arquivo novo.</p>' : ''}</div>`;
  }

  const varios = ehVarios(f), imagem = f.id === 'imagens', n = s.arquivos.length;
  const comErro = s.arquivos.map((a) => ficha(a).erro).filter(Boolean);
  const erros = [s.erro, ...new Set(comErro)].filter(Boolean).map((texto) => `<p class="erro" role="alert">${i('triangle-alert')}<span>${esc(texto)}</span></p>`).join('');
  if (!n) {
    return `${frase}<button class="solta vazia" id="abrir" data-abrir><span class="sobe">${i('upload')}</span><b>${imagem ? 'Escolha as imagens' : varios ? 'Escolha os PDFs' : 'Escolha o PDF'}</b>
      <span>Clique para escolher ou arraste aqui · ${imagem ? 'JPG, PNG ou WebP' : 'PDF'}${varios ? ' · vários de uma vez' : ''}</span></button>${erros}`;
  }
  const cima = varios
    ? `<button class="solta curta" id="abrir" data-abrir>${i('upload')}<b>${imagem ? 'Adicionar imagens' : 'Adicionar PDFs'}</b><span>ou arraste aqui</span></button>`
    : `<div class="linha-arq">${i('file-text')}<b title="${esc(s.arquivos[0].name)}">${esc(s.arquivos[0].name)}</b><small>${tamanhoLegivel(s.arquivos[0].size)}</small><button class="btn leve p" id="abrir" data-abrir>Trocar</button></div>`;
  const m = ficha(s.arquivos[0]);
  const nota = !varios && m.erro ? '' : !varios && m.total === null ? '<p role="status">Lendo o PDF…</p>'
    : f.id === 'organizar' ? `<p>${s.paginas.filter((p) => !p.fora).length} de ${plural(s.paginas.length, 'página', 'páginas')} no PDF novo.</p><button class="btn sec p" id="girar-todas" data-acao="todas">${i('rotate-cw')}Girar todas</button><button class="btn leve p" id="desfazer" data-acao="desfazer">Desfazer</button>`
    : varios ? `<p>${plural(n, 'arquivo', 'arquivos')}. Arraste para mudar a ordem.</p>`
    : `<p>${plural(m.total, 'página', 'páginas')}${m.total > LIMITE_MINIATURAS ? `. A prévia mostra as ${LIMITE_MINIATURAS} primeiras; o resultado vale para todas` : ''}.</p>`;
  return `${frase}${cima}${erros}<div class="nota-grade">${nota}</div><ol class="grade ${f.id === 'organizar' ? 'larga' : ''}" id="grade">${miniaturas(f, s)}</ol>`;
}

function rodapeAjustes(f, s) {
  const falta = oQueFalta(f, s);
  return `<button class="btn prim cheio" id="rodar" data-rodar ${falta ? 'disabled' : ''}>${i(f.icone)}${f.botao}</button>${falta ? `<p class="falta ${falta.mal ? 'mal' : ''}" aria-live="polite">${falta.texto}</p>` : ''}`;
}

function resumoTarefa(s) {
  if (s.saidas.length === 1) return s.saidas[0].nome;
  const arquivos = 'arquivo' in s.entrada ? [s.entrada.arquivo] : s.entrada.arquivos;
  return arquivos[0].name + (arquivos.length > 1 ? ` e mais ${arquivos.length - 1}` : '');
}

function direita(f, s) {
  const campos = AJUSTES[f.id].map((a) => campo(s, a)).join('');
  const ajustes = s.fase !== 'editar' ? '' : `<section class="caixa"><h2>${campos ? 'Como você quer?' : 'É só conferir'}</h2>${campos}
    ${NOTAS[f.id] ? `<p class="nota">${NOTAS[f.id]}</p>` : !campos ? '<p class="nota">O original continua como está.</p>' : ''}
    <div class="enviar" id="enviar">${rodapeAjustes(f, s)}</div></section>`;
  const tarefa = s.fase === 'editar'
    ? '<p class="vazio-tarefa">Nada por enquanto. O que você mandar fazer aparece aqui.</p>'
    : `${s.fase === 'fazendo' ? `<p class="aviso-aba">${i('triangle-alert')}<span>Não feche esta aba até terminar.</span></p>` : ''}
      <div class="tarefa ${s.fase === 'pronto' ? 'feita' : ''}">${i(s.fase === 'pronto' ? 'circle-check' : 'loader-circle', s.fase === 'pronto' ? '' : 'gira')}
        <div><b>${f.nome}</b><small>${esc(resumoTarefa(s))}</small></div></div>`;
  return `${ajustes}<section class="caixa"><h2>Tarefas desta janela</h2>${tarefa}</section>`;
}

function telaTrabalho(f) {
  const s = estado(f);
  return casca(f, `<main class="palco"><section class="janela" aria-labelledby="titulo-janela">
    <header class="jan-topo"><span class="quad">${i(f.icone)}</span><div><h1 id="titulo-janela" tabindex="-1">${f.nome}</h1><small>${MARCA.nome}</small></div>
      <a class="redondo" href="#ferramentas" aria-label="Fechar e voltar às ferramentas">${i('x')}</a></header>
    <div class="jan-corpo"><div>${esquerda(f, s)}</div><div class="direita">${direita(f, s)}</div></div></section></main>`);
}

function desenha() {
  cancelAnimationFrame(quadro);
  const rota = location.hash.slice(1) || 'inicio', f = atual();
  const site = !f && rota !== 'ferramentas';
  const trocou = rota !== rotaAnterior, ativo = document.activeElement, foco = ativo?.id;
  const cursor = ativo?.type === 'text' || ativo?.type === 'search' ? [ativo.selectionStart, ativo.selectionEnd] : null;
  const altura = scrollY;
  const menu = raiz.querySelector('.menu')?.scrollTop;
  document.documentElement.toggleAttribute('data-site', site);
  raiz.innerHTML = f ? telaTrabalho(f) : rota === 'ferramentas' ? telaFerramentas() : rota === 'baixar' && NA_WEB ? telaBaixar() : rota === 'licencas' ? telaLicencas() : telaInicio();
  const novoMenu = raiz.querySelector('.menu');
  if (novoMenu && menu !== undefined) novoMenu.scrollTop = menu;
  if (trocou) {
    scrollTo(0, 0);
    if (rotaAnterior !== null) raiz.querySelector('h1')?.focus({ preventScroll: true });
  } else {
    scrollTo(0, altura);
    const novo = foco && document.getElementById(foco);
    novo?.focus?.({ preventScroll: true });
    if (cursor && (novo?.type === 'text' || novo?.type === 'search')) novo.setSelectionRange(...cursor);
  }
  rotaAnterior = rota;
  animarDiagrama();
  observarMiniaturas();
  iniciarCena();
}

function avisar(texto) {
  const r = document.querySelector('#recado');
  r.textContent = texto; r.hidden = false;
  clearTimeout(relogioRecado);
  relogioRecado = setTimeout(() => { r.hidden = true; }, 3500);
}

function receber(lista) {
  const f = atual();
  if (!f) { avisar('Escolha primeiro o que você quer fazer.'); location.hash = 'ferramentas'; return; }
  const s = estado(f);
  if (s.fase !== 'editar') { avisar(s.fase === 'fazendo' ? 'Espere esta tarefa terminar.' : 'Clique em "Fazer de novo" para usar outro arquivo.'); return; }
  const todos = [...lista], imagem = f.id === 'imagens';
  const bons = todos.filter((a) => (imagem
    ? /^image\/(jpeg|png|webp)$/.test(a.type) || /\.(jpe?g|png|webp)$/i.test(a.name)
    : a.type === 'application/pdf' || /\.pdf$/i.test(a.name)));
  const fora = todos.length - bons.length;
  const avisos = fora ? [`${fora === 1 ? '1 arquivo não entrou' : `${fora} arquivos não entraram`}: aqui só vale ${imagem ? 'JPG, PNG ou WebP' : 'PDF'}.`] : [];
  if (!ehVarios(f) && bons.length > 1) avisos.push('Esta ferramenta usa um PDF por vez. Entrou só o primeiro.');
  s.erro = avisos.join(' ');
  if (bons.length) {
    const novos = ehVarios(f) ? [...s.arquivos, ...bons] : bons.slice(0, 1);
    colocarArquivos(f, novos);
  }
  desenha();
}

function colocarArquivos(f, arquivos) {
  const s = estado(f);
  s.arquivos = arquivos;
  soltarArquivos();
  const lidas = arquivos.map(ficha);
  if (!ehVarios(f)) s.paginas = ordemOriginal(lidas[0]?.total ?? 0);
}

function limparResultado(s) {
  s.saidas.forEach((x) => URL.revokeObjectURL(x.url));
  Object.assign(s, { fase: 'editar', saidas: [], aviso: null, compressao: null, entrada: null, destinos: false, erro: '', pct: 0, etapa: '' });
}

function nomeLimpo(nome) {
  return nome.trim().replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim();
}

async function rodar(f) {
  const s = estado(f);
  if (oQueFalta(f, s)) return desenha();
  const entrada = entradaDe(f, s), controle = new AbortController(), tarefa = { f, s, controle };
  limparResultado(s);
  Object.assign(s, { fase: 'fazendo', entrada, etapa: 'Começando…' });
  ocupada = tarefa;
  desenha();
  const progresso = (fracao, etapa) => {
    if (ocupada !== tarefa) return;
    s.pct = Math.round(Math.min(1, Math.max(0, fracao)) * 100);
    s.etapa = etapa;
    const barraDaVez = atual() === f && document.querySelector('#barra');
    if (!barraDaVez) return;
    barraDaVez.style.transform = `scaleX(${Math.max(0.04, s.pct / 100)})`;
    document.querySelector('#pct').textContent = `${s.pct}%`;
    document.querySelector('#etapa').textContent = etapa;
  };
  try {
    const r = await executarTarefa(entrada, progresso, controle.signal);
    if (controle.signal.aborted) return; // cancelou no meio: o resultado tardio é descartado
    if (f.id === 'juntar' && nomeLimpo(s.op.nome)) r.saidas[0].nome = `${nomeLimpo(s.op.nome)}.pdf`;
    Object.assign(s, { fase: 'pronto', pct: 100, aviso: r.aviso, compressao: r.compressao ?? null, saidas: r.saidas.map((x) => ({ ...x, url: URL.createObjectURL(x.blob) })) });
  } catch (e) {
    if (controle.signal.aborted) return;
    Object.assign(s, { fase: 'editar', erro: mensagemDe(e, ('arquivo' in entrada ? entrada.arquivo : entrada.arquivos[0]).name) });
  } finally {
    if (ocupada === tarefa) ocupada = null;
    if (!controle.signal.aborted) {
      desenha();
      if (atual() !== f) avisar(`${f.nome}: ${s.fase === 'pronto' ? 'pronto para salvar.' : 'não deu certo.'}`);
    }
  }
}

function cancelar() {
  const { s, controle } = ocupada;
  // não espera o pdf.js acabar o passo em curso: sai na hora e o que chegar depois é descartado
  controle.abort();
  encerrarEdicao('Cancelada por você.');
  ocupada = null;
  limparResultado(s);
  avisar('Cancelado. O original continua como está.');
  desenha();
}

async function salvar(s) {
  if (s.saidas.length === 1) return baixarArquivo(s.saidas[0].url, s.saidas[0].nome);
  try {
    const arquivos = await Promise.all(s.saidas.map(async (x) => ({ nome: x.nome, dados: new Uint8Array(await x.blob.arrayBuffer()) })));
    const url = URL.createObjectURL(criarZip(arquivos));
    baixarArquivo(url, nomeDoZip(s.entrada));
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    avisar('Faltou memória para montar o ZIP. Salve os arquivos um a um, na lista.');
  }
}

function levarPara(s, g) {
  const alvo = estado(g);
  if (alvo.fase === 'fazendo') return avisar('Essa ferramenta ainda está trabalhando.');
  limparResultado(alvo);
  colocarArquivos(g, s.saidas.map((x) => new File([x.blob], x.nome, { type: 'application/pdf' })));
  s.destinos = false;
  location.hash = `f/${g.id}`;
}

function trocarLugar(f, de, para) {
  const s = estado(f);
  if (ehVarios(f)) s.arquivos = moverItem(s.arquivos, de, para);
  else s.paginas = moverItem(s.paginas, de, para);
}

function agirNaPagina(f, acao, k) {
  const s = estado(f), p = s.paginas[k];
  if (acao === 'antes') trocarLugar(f, k, k - 1);
  if (acao === 'depois') trocarLugar(f, k, k + 1);
  if (acao === 'tirar') { s.arquivos.splice(k, 1); soltarArquivos(); }
  if (acao === 'esquerda') p.giro = (p.giro + 270) % 360;
  if (acao === 'direita') p.giro = (p.giro + 90) % 360;
  if (acao === 'fora') p.fora = !p.fora;
  if (acao === 'todas') s.paginas.forEach((x) => { x.giro = (x.giro + 90) % 360; });
  if (acao === 'desfazer') s.paginas = ordemOriginal(s.paginas.length);
  desenha();
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset, f = atual(), s = f && estado(f);
  if ('rolar' in d) document.getElementById(d.rolar).scrollIntoView({ behavior: parado.matches ? 'auto' : 'smooth' });
  else if ('so' in d) { geral.sistema = d.so; desenha(); }
  else if ('temaTroca' in d) { aparencia.modo = modoReal() === 'claro' ? 'escuro' : 'claro'; aplicarAparencia(true); }
  else if ('grupo' in d) { geral.grupo = d.grupo; desenha(); }
  else if ('limpar' in d) { geral.busca = ''; geral.grupo = ''; desenha(); document.querySelector('#busca').focus(); }
  else if ('abrir' in d) {
    escolher.accept = f.id === 'imagens' ? '.jpg,.jpeg,.png,.webp' : 'application/pdf,.pdf';
    escolher.multiple = VARIOS.includes(f.id);
    escolher.click();
  } else if ('opcao' in d) { s.op[d.opcao] = d.valor; if (d.opcao === 'mbPronto') s.op.mb = d.valor; desenha(); }
  else if ('acao' in d) agirNaPagina(f, d.acao, +d.k);
  else if ('rodar' in d) void rodar(f);
  else if ('cancelar' in d) cancelar();
  else if ('salvar' in d) void salvar(s);
  else if ('uma' in d) baixarArquivo(s.saidas[+d.uma].url, s.saidas[+d.uma].nome);
  else if ('outra' in d) { s.destinos = !s.destinos; desenha(); }
  else if ('destino' in d) levarPara(s, FERRAMENTAS.find((g) => g.id === d.destino));
  else if ('deNovo' in d) { limparResultado(s); colocarArquivos(f, []); if (f.id === 'comprimir') s.op.nivel = 'equilibrada'; desenha(); }
  else if ('mais' in d) { s.op.nivel = s.compressao.proximo; s.op.alvo = ''; void rodar(f); } // refaz do original, só o nível de cima
  else if ('dividir' in d) {
    const g = FERRAMENTAS.find((x) => x.id === 'tamanho'), alvo = estado(g);
    if (alvo.fase === 'fazendo') return avisar('Essa ferramenta ainda está trabalhando.');
    limparResultado(alvo);
    colocarArquivos(g, s.saidas.length ? s.saidas.map((x) => new File([x.blob], x.nome, { type: 'application/pdf' })) : [...s.arquivos]);
    location.hash = `f/${g.id}`;
  }
});

function mudarCampo(e) {
  if (e.target.id === 'busca') { geral.busca = e.target.value; document.querySelector('#lista').innerHTML = listaFerramentas(); return; }
  const chave = e.target.dataset.campo;
  if (!chave) return;
  const f = atual(), s = estado(f);
  s.op[chave] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  // só o que depende do campo: redesenhar tudo tiraria o cursor de quem digita
  const grade = document.querySelector('#grade'), enviar = document.querySelector('#enviar');
  if (chave === 'mb') {
    s.op.mbPronto = s.op.mb;
    document.querySelectorAll('[data-opcao=mbPronto]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.valor === s.op.mb)));
  }
  if (grade && ['paginas', 'texto', 'posicao', 'formato', 'inicio', 'primeira'].includes(chave)) { grade.innerHTML = miniaturas(f, s); observarMiniaturas(); }
  if (enviar) enviar.innerHTML = rodapeAjustes(f, s);
}
document.addEventListener('input', mudarCampo);
escolher.addEventListener('change', () => { receber(escolher.files); escolher.value = ''; });

document.addEventListener('pointermove', (e) => {
  const op = e.target.closest?.('.op');
  if (!op) return;
  const r = op.getBoundingClientRect();
  op.style.setProperty('--mx', `${e.clientX - r.left}px`);
  op.style.setProperty('--my', `${e.clientY - r.top}px`);
});
document.addEventListener('dragstart', (e) => {
  const li = e.target.closest?.('[data-item]');
  if (!li) return;
  levando = +li.dataset.item;
  li.classList.add('levando');
  e.dataTransfer.setData('text/plain', String(levando)); // o Firefox só arrasta com algum dado
});
document.addEventListener('dragend', () => {
  levando = null;
  document.querySelectorAll('.levando,.alvo[data-item]').forEach((el) => el.classList.remove('levando', 'alvo'));
});
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (levando === null) { document.body.classList.add('arrastando'); return; }
  const li = e.target.closest?.('[data-item]');
  document.querySelectorAll('.alvo[data-item]').forEach((el) => el !== li && el.classList.remove('alvo'));
  li?.classList.add('alvo');
});
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('arrastando'); });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('arrastando');
  if (levando === null) { if (e.dataTransfer.files.length) receber(e.dataTransfer.files); return; }
  const li = e.target.closest?.('[data-item]'), f = atual();
  if (li) { trocarLugar(f, levando, +li.dataset.item); desenha(); }
  levando = null;
});

montarAparencia();
addEventListener('beforeunload', (e) => { if (ocupada) { e.preventDefault(); e.returnValue = ''; } });
addEventListener('hashchange', desenha);
desenha();
