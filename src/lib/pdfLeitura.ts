// pdf.js: abrir, montar um PDF novo com páginas escolhidas (extractPages) e desenhar páginas.
// O pdf.js trabalha no Web Worker dele, que vem dentro do HTML; os bytes ficam na memória desta aba, sem rede.
import * as lib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { arquivoEmbutido, novoWorker } from '@/lib/embutidos';

export type EntradaMontagem = Parameters<PDFDocumentProxy['extractPages']>[0][number];
export type { PDFDocumentProxy };

/** Teto de pixels por imagem de página (16 MP, abaixo do limite de canvas do Safari no iPhone): página enorme sai menor em vez de sair em branco. */
const MAX_PIXELS = 16_000_000;

/** CMaps e fontes padrão saem do próprio HTML, em vez de fetch (a CSP bloqueia qualquer conexão). */
class DadosEmbutidos {
  async fetch({ filename }: { filename: string }): Promise<Uint8Array> {
    return arquivoEmbutido(filename);
  }
}

// useWasm false: os decodificadores JBIG2/CCITT e JPX vão em JavaScript dentro do worker (ver montar.mjs).
// As pastas são fictícias: servem só para o pdf.js pedir o nome do arquivo ao DadosEmbutidos.
const OPCOES = {
  useWasm: false, useWorkerFetch: false, isEvalSupported: false, enableXfa: false, verbosity: 0,
  BinaryDataFactory: DadosEmbutidos, cMapUrl: 'embutido/', cMapPacked: true, standardFontDataUrl: 'embutido/', wasmUrl: 'embutido/',
};

function motivo(e: unknown, nome: string): string {
  if (e instanceof lib.PasswordException) return `"${nome}" está protegido por senha. Abra-o no leitor de PDF, salve uma cópia sem senha e tente de novo.`;
  if (e instanceof lib.InvalidPDFException) return `"${nome}" não é um PDF válido ou está corrompido.`;
  return `Não foi possível abrir "${nome}" (${e instanceof Error ? e.message : 'erro desconhecido'}).`;
}

/** Os bytes passam para o pdf.js (somem daqui): mande uma cópia se ainda for usá-los. Feche com destroy(). */
export async function abrirPdf(dados: Uint8Array, nome: string): Promise<PDFDocumentProxy> {
  // um worker por documento: dividir a porta faria o destroy de um PDF derrubar o outro
  const porta = novoWorker('leitor');
  const falhou = new Promise<never>((_, rejeitar) => {
    porta.onerror = () => rejeitar(new Error('o leitor de PDF não iniciou neste navegador'));
  });
  const worker = new lib.PDFWorker({ port: porta as unknown as null }); // o tipo publicado do pdf.js diz null, mas aceita Worker
  const tarefa = lib.getDocument({ data: dados, worker, ...OPCOES });
  const destruir = tarefa.destroy.bind(tarefa);
  tarefa.destroy = async () => {
    try {
      await destruir();
    } finally {
      worker.destroy();
      porta.terminate();
    }
  };
  try {
    return await Promise.race([tarefa.promise, falhou]);
  } catch (e) {
    void tarefa.destroy();
    throw new Error(motivo(e, nome));
  }
}

/** Monta um PDF com as páginas pedidas, sem conferir (serve para medir o tamanho de cada página). */
export async function extrairBytes(doc: PDFDocumentProxy, entradas: EntradaMontagem[]): Promise<Uint8Array> {
  const bytes = (await doc.extractPages(entradas)) as Uint8Array | null;
  if (!bytes) throw new Error('O pdf.js não conseguiu montar o PDF novo a partir deste arquivo.');
  return bytes;
}

/** Monta o PDF novo e confere o número de páginas antes de entregar: se não bater, nada sai. */
export async function montarPdf(doc: PDFDocumentProxy, entradas: EntradaMontagem[], esperadas: number): Promise<Uint8Array> {
  const bytes = await extrairBytes(doc, entradas);
  const conferido = await abrirPdf(bytes.slice(), 'PDF gerado');
  const total = conferido.numPages;
  await conferido.loadingTask.destroy();
  if (total !== esperadas) throw new Error(`O PDF gerado ficou com ${total} páginas, mas deveria ter ${esperadas}. Nada foi entregue.`);
  return bytes;
}

/** escala 1 = 72 dpi; larguraAlvo (px) é para miniatura. */
export type OpcoesDesenho = { tipo: 'image/jpeg' | 'image/png'; intent: 'display' | 'print' } & ({ escala: number } | { larguraAlvo: number });

/** Desenha a página num canvas, no tamanho pedido (com teto de pixels). */
async function desenharCanvas(doc: PDFDocumentProxy, numero: number, opcoes: OpcoesDesenho) {
  const pagina = await doc.getPage(numero);
  const base = pagina.getViewport({ scale: 1 });
  const desejada = 'escala' in opcoes ? opcoes.escala : opcoes.larguraAlvo / base.width;
  const escala = Math.min(desejada, Math.sqrt(MAX_PIXELS / (base.width * base.height)));
  const viewport = pagina.getViewport({ scale: escala });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await pagina.render({ canvas, viewport, intent: opcoes.intent }).promise;
  pagina.cleanup();
  return { canvas, reduzida: escala < desejada };
}

/**
 * Desenha a página numa imagem (miniaturas). intent "display" acompanha o quadro da tela: é para o que a pessoa
 * está vendo. Para lote em segundo plano, use desenharEmBitmap e codifique no worker.
 */
export async function desenharPagina(doc: PDFDocumentProxy, numero: number, opcoes: OpcoesDesenho): Promise<{ blob: Blob; reduzida: boolean }> {
  const { canvas, reduzida } = await desenharCanvas(doc, numero, opcoes);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, opcoes.tipo, 0.92));
  canvas.width = 0; // libera a memória do desenho já
  if (!blob) throw new Error(`Não foi possível gerar a imagem da página ${numero}.`);
  return { blob, reduzida };
}

/**
 * Desenha a página (intent "print": não depende do quadro da tela) e devolve o bitmap para codificar no worker.
 * Com a aba escondida, o Chrome atrasa ~1 s cada toBlob/convertToBlob da tela principal; no worker leva milissegundos.
 */
export async function desenharEmBitmap(doc: PDFDocumentProxy, numero: number, escala: number): Promise<{ bitmap: ImageBitmap; reduzida: boolean }> {
  const { canvas, reduzida } = await desenharCanvas(doc, numero, { escala, tipo: 'image/png', intent: 'print' });
  const bitmap = await createImageBitmap(canvas);
  canvas.width = 0;
  return { bitmap, reduzida };
}

/** Devolve a vez ao navegador entre páginas sem usar timer (timer é freado com a aba em segundo plano). */
export function cederVez(): Promise<void> {
  return new Promise((r) => {
    const canal = new MessageChannel();
    canal.port1.onmessage = () => {
      canal.port1.close();
      r();
    };
    canal.port2.postMessage(null);
  });
}
