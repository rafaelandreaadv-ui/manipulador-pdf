// Edições com o pdf-lib, feitas dentro do Web Worker do Manipulador de PDF (src/lib/pdfEdicao.worker.ts).
// Só bytes entram e saem: nada de rede, disco ou log. Imagens e compressão ficam em src/lib/pdfEdicaoImagens.ts.
import { PDFDocument, PDFName, PDFRef, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { FormatoNumero, NivelCompressao, PosicaoNumero, PosicaoTexto } from '@/lib/filaPdf';

export type { NivelCompressao };
/** Página inteira já em JPEG e o tamanho dela no PDF (pontos), para montar o PDF rasterizado. */
export type PaginaJpeg = { jpeg: Uint8Array; largura: number; altura: number };

export type Caixa = { x: number; y: number; width: number; height: number };
export type Jpeg = { jpeg: Uint8Array; largura: number; altura: number };
export type AoProgresso = (fracao: number, etapa: string) => void;
export type OpcoesNumero = { posicao: PosicaoNumero; formato: FormatoNumero; inicio: number };
export type OpcoesMarca = { texto: string; opacidade: number };
/** Texto fixo em canto ou centro da página (cabeçalho, rodapé, "Doc. 01"); caixa = fundo branco com borda, para ler sobre o conteúdo. */
export type OpcoesCarimbo = { texto: string; posicao: PosicaoTexto; soPrimeira: boolean; tamanho: number; caixa: boolean; negrito: boolean };
/** Devolve a imagem menor ou null quando não dá para refazer (ela fica como está no PDF). */
export type Recodificar = (jpeg: Uint8Array, largura: number, altura: number) => Promise<Jpeg | null>;

export type PedidoEdicao =
  | { tipo: 'girar'; bytes: Uint8Array; giros: number[] }
  | { tipo: 'numerar'; bytes: Uint8Array; opcoes: OpcoesNumero }
  | { tipo: 'marcaDagua'; bytes: Uint8Array; opcoes: OpcoesMarca }
  | { tipo: 'carimbar'; bytes: Uint8Array; opcoes: OpcoesCarimbo }
  | { tipo: 'metadados'; bytes: Uint8Array }
  | { tipo: 'a4'; bytes: Uint8Array }
  | { tipo: 'imagens'; arquivos: File[] }
  | { tipo: 'comprimir'; bytes: Uint8Array; nivel: NivelCompressao }
  /** Página já desenhada pelo pdf.js, para virar JPG/PNG aqui (fora da tela principal). */
  | { tipo: 'codificar'; imagem: ImageBitmap; formato: 'image/jpeg' | 'image/png'; qualidade?: number }
  /** Cada página vira uma imagem, no tamanho original (compressão máxima: o texto deixa de ser texto). */
  | { tipo: 'paginasJpeg'; paginas: PaginaJpeg[] };
export type MensagemWorker =
  | { id: number; progresso: number; etapa: string }
  | { id: number; bytes: Uint8Array; info?: string }
  | { id: number; erro: string };

/** Erro com texto pronto para a pessoa ler (os do pdf-lib vêm em inglês e ganham uma frase antes). */
export class ErroAmigavel extends Error {}

export const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM_TEXTO = 28;
const TAMANHO_NUMERO = 10;
export const N = (nome: string) => PDFName.of(nome);
// O pdf-lib não grava "Producer: pdf-lib" nem datas novas. (Quando o arquivo passa antes pelo pdf.js, ele grava
// "Creator: PDF.js / Producer: Firefox"; "Remover metadados" apaga tudo isso.)
export const SEM_METADADOS = { updateMetadata: false };

export function normalizarGiro(angulo: number): number {
  return (((Math.round(angulo / 90) * 90) % 360) + 360) % 360;
}

/** Ponto como a pessoa vê a página (origem embaixo à esquerda, já girada) levado para o espaço do PDF. */
export function pontoNoPdf(caixa: Caixa, giro: number, vx: number, vy: number): { x: number; y: number } {
  const { x, y, width: w, height: h } = caixa;
  if (giro === 90) return { x: x + w - vy, y: y + vx };
  if (giro === 180) return { x: x + w - vx, y: y + h - vy };
  if (giro === 270) return { x: x + vy, y: y + h - vx };
  return { x: x + vx, y: y + vy };
}

export function tamanhoVisual(caixa: Caixa, giro: number): { largura: number; altura: number } {
  return giro % 180 === 0 ? { largura: caixa.width, altura: caixa.height } : { largura: caixa.height, altura: caixa.width };
}

export function abrir(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, SEM_METADADOS).catch((e: unknown) => {
    // o pdf.js remonta mantendo a restrição do autor, e o pdf-lib não edita PDF assim: explicar, sem tirar a proteção
    if (e instanceof Error && e.message.includes('is encrypted')) {
      throw new ErroAmigavel('O autor deste PDF bloqueou a edição. A ferramenta não tira essa proteção: use uma cópia sem restrição.');
    }
    throw e;
  });
}

export function salvar(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: true });
}

function geometria(pagina: PDFPage) {
  const caixa = pagina.getCropBox();
  const giro = normalizarGiro(pagina.getRotation().angle);
  return { caixa, giro, ...tamanhoVisual(caixa, giro) };
}

/** Onde começa um texto de largura e tamanho dados, na posição pedida, como a pessoa vê a página (margem de 28 pt). */
export function posicaoVisual(posicao: PosicaoTexto, pagina: { largura: number; altura: number }, larguraTexto: number, tamanho: number) {
  const [vertical, horizontal] = posicao.split('-');
  const meio = (pagina.largura - larguraTexto) / 2;
  const vx = horizontal === 'esquerda' ? MARGEM_TEXTO : horizontal === 'centro' ? meio : pagina.largura - MARGEM_TEXTO - larguraTexto;
  const vy = vertical === 'superior' ? pagina.altura - MARGEM_TEXTO - tamanho : MARGEM_TEXTO;
  return { vx, vy };
}

/** giros[i] (0, 90, 180 ou 270, sentido horário) é somado ao giro que a página i já tem. */
export async function girarPaginas(bytes: Uint8Array, giros: number[]): Promise<Uint8Array> {
  const doc = await abrir(bytes);
  const paginas = doc.getPages();
  if (paginas.length !== giros.length) throw new ErroAmigavel(`O PDF tem ${paginas.length} páginas, mas chegaram ${giros.length} giros.`);
  paginas.forEach((p, i) => p.setRotation(degrees(normalizarGiro(p.getRotation().angle + giros[i]))));
  return salvar(doc);
}

export function textoDoNumero(formato: FormatoNumero, n: number, ultimo: number): string {
  if (formato === 'pagina-n-de-t') return `Página ${n} de ${ultimo}`;
  if (formato === 'n-de-t') return `${n}/${ultimo}`;
  return String(n);
}

export async function numerarPaginas(bytes: Uint8Array, opcoes: OpcoesNumero): Promise<Uint8Array> {
  const doc = await abrir(bytes);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const paginas = doc.getPages();
  const ultimo = opcoes.inicio + paginas.length - 1;
  paginas.forEach((pagina, i) => {
    const texto = textoDoNumero(opcoes.formato, opcoes.inicio + i, ultimo);
    const { caixa, giro, largura, altura } = geometria(pagina);
    const { vx, vy } = posicaoVisual(opcoes.posicao, { largura, altura }, fonte.widthOfTextAtSize(texto, TAMANHO_NUMERO), TAMANHO_NUMERO);
    const { x, y } = pontoNoPdf(caixa, giro, vx, vy);
    pagina.drawText(texto, { x, y, size: TAMANHO_NUMERO, font: fonte, color: rgb(0.2, 0.2, 0.2), rotate: degrees(giro) });
  });
  return salvar(doc);
}

function larguraEm1(fonte: PDFFont, texto: string): number {
  try {
    return fonte.widthOfTextAtSize(texto, 1);
  } catch {
    throw new ErroAmigavel('O texto tem caractere que a fonte padrão do PDF não aceita. Use letras, números e pontuação comuns.');
  }
}

type Carimbo = { pagina: PDFPage; texto: string; fonte: PDFFont; largura: number; opcoes: OpcoesCarimbo };

function desenharCarimbo({ pagina, texto, fonte, largura, opcoes: o }: Carimbo) {
  const { caixa, giro, ...visivel } = geometria(pagina);
  const { vx, vy } = posicaoVisual(o.posicao, visivel, largura, o.tamanho);
  if (o.caixa) {
    const folga = o.tamanho * 0.45;
    const canto = pontoNoPdf(caixa, giro, vx - folga, vy - o.tamanho * 0.4);
    pagina.drawRectangle({
      ...canto, width: largura + 2 * folga, height: o.tamanho * 1.3, rotate: degrees(giro),
      color: rgb(1, 1, 1), borderColor: rgb(0.25, 0.25, 0.25), borderWidth: 0.8,
    });
  }
  pagina.drawText(texto, { ...pontoNoPdf(caixa, giro, vx, vy), size: o.tamanho, font: fonte, color: rgb(0.1, 0.1, 0.1), rotate: degrees(giro) });
}

export async function carimbarTexto(bytes: Uint8Array, opcoes: OpcoesCarimbo): Promise<Uint8Array> {
  const texto = opcoes.texto.trim();
  if (!texto) throw new ErroAmigavel('Escreva o texto.');
  const doc = await abrir(bytes);
  const fonte = await doc.embedFont(opcoes.negrito ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
  const largura = larguraEm1(fonte, texto) * opcoes.tamanho;
  const paginas = opcoes.soPrimeira ? doc.getPages().slice(0, 1) : doc.getPages();
  for (const pagina of paginas) desenharCarimbo({ pagina, texto, fonte, largura, opcoes });
  return salvar(doc);
}

/** Tamanho da fonte para o texto ocupar ~70% da diagonal da página, entre 12 e 96 pontos. */
export function tamanhoDaMarca(larguraEmUm: number, largura: number, altura: number): number {
  return Math.max(12, Math.min(96, (Math.hypot(largura, altura) * 0.7) / larguraEmUm));
}

/** Texto centrado na página, ao longo da diagonal (de baixo à esquerda para cima à direita, como a pessoa vê). */
function origemDaMarca(pagina: PDFPage, emUm: number) {
  const { caixa, giro, largura, altura } = geometria(pagina);
  const tamanho = tamanhoDaMarca(emUm, largura, altura);
  const angulo = Math.atan2(altura, largura);
  const [meiaLargura, meiaAltura] = [(emUm * tamanho) / 2, tamanho * 0.35];
  const vx = largura / 2 - (Math.cos(angulo) * meiaLargura - Math.sin(angulo) * meiaAltura);
  const vy = altura / 2 - (Math.sin(angulo) * meiaLargura + Math.cos(angulo) * meiaAltura);
  return { ...pontoNoPdf(caixa, giro, vx, vy), tamanho, rotacao: giro + (angulo * 180) / Math.PI };
}

export async function aplicarMarcaDagua(bytes: Uint8Array, opcoes: OpcoesMarca): Promise<Uint8Array> {
  const texto = opcoes.texto.trim();
  if (!texto) throw new ErroAmigavel("Escreva o texto da marca d'água.");
  const doc = await abrir(bytes);
  const fonte = await doc.embedFont(StandardFonts.HelveticaBold);
  const emUm = larguraEm1(fonte, texto);
  for (const pagina of doc.getPages()) {
    const { x, y, tamanho, rotacao } = origemDaMarca(pagina, emUm);
    pagina.drawText(texto, { x, y, size: tamanho, font: fonte, color: rgb(0.45, 0.45, 0.45), opacity: opcoes.opacidade, rotate: degrees(rotacao) });
  }
  return salvar(doc);
}

/** Apaga as informações do documento (título, autor, programas, datas) e o XMP. Apaga os objetos, não só a referência. */
export async function limparMetadados(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await abrir(bytes);
  const { context, catalog } = doc;
  const info = context.trailerInfo.Info;
  if (info instanceof PDFRef) context.delete(info);
  context.trailerInfo.Info = undefined;
  const xmp = catalog.get(N('Metadata'));
  if (xmp instanceof PDFRef) context.delete(xmp);
  catalog.delete(N('Metadata'));
  return salvar(doc);
}

const perto = (a: number, b: number) => Math.abs(a - b) < 2;
export const ehA4 = (w: number, h: number) => (perto(w, A4.largura) && perto(h, A4.altura)) || (perto(w, A4.altura) && perto(h, A4.largura));

/** Página fora do A4 vira A4 (deitada se for mais larga), com o conteúdo inteiro, centrado e na mesma proporção. */
function desenharEmA4(novo: PDFDocument, original: PDFPage, embutida: Awaited<ReturnType<PDFDocument['embedPage']>>) {
  const { width, height } = original.getCropBox();
  const [lp, ap] = width > height ? [A4.altura, A4.largura] : [A4.largura, A4.altura];
  const escala = Math.min(lp / width, ap / height);
  const nova = novo.addPage([lp, ap]);
  nova.drawPage(embutida, { x: (lp - width * escala) / 2, y: (ap - height * escala) / 2, width: width * escala, height: height * escala });
  nova.setRotation(degrees(normalizarGiro(original.getRotation().angle)));
}

/** Páginas já em A4 são copiadas como estão (com links); as outras são redesenhadas em A4 (links e campos dessas se perdem). */
export async function ajustarParaA4(bytes: Uint8Array): Promise<{ bytes: Uint8Array; ajustadas: number; total: number }> {
  const origem = await abrir(bytes);
  const novo = await PDFDocument.create(SEM_METADADOS);
  const paginas = origem.getPages();
  const fora = paginas.filter((p) => !ehA4(p.getCropBox().width, p.getCropBox().height));
  // Página em branco sem fluxo de conteúdo: o pdf-lib só a embute com um fluxo vazio.
  for (const p of fora) if (!p.node.Contents()) p.node.set(N('Contents'), origem.context.register(origem.context.stream('')));
  const copiadas = await novo.copyPages(origem, paginas.flatMap((p, i) => (fora.includes(p) ? [] : [i])));
  const caixas = fora.map((p) => {
    const c = p.getCropBox();
    return { left: c.x, bottom: c.y, right: c.x + c.width, top: c.y + c.height };
  });
  const embutidas = fora.length ? await novo.embedPages(fora, caixas) : [];
  for (const p of paginas) {
    if (fora.includes(p)) desenharEmA4(novo, p, embutidas[fora.indexOf(p)]);
    else novo.addPage(copiadas.shift() as PDFPage);
  }
  return { bytes: await salvar(novo), ajustadas: fora.length, total: paginas.length };
}
