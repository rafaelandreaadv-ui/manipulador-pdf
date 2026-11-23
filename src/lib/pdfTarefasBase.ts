// Peças comuns das tarefas do Manipulador de PDF (src/lib/pdfTarefas.ts e pdfTarefasExtras.ts).
// Tudo na memória desta aba: o pdf.js monta páginas no worker dele; o pdf-lib edita no nosso worker.
import { semExtensao } from '@/lib/ferramentas';
import type { EntradaTarefa } from '@/lib/filaPdf';
import type { PedidoEdicao } from '@/lib/pdfEdicao';
import { editarNoWorker } from '@/lib/pdfEdicaoCliente';
import { abrirPdf, montarPdf, type PDFDocumentProxy } from '@/lib/pdfLeitura';

export type SaidaPronta = { nome: string; blob: Blob };
/** compressao: só no Comprimir. ganho = fração reduzida (0 a 1); proximo = nível mais forte que ainda dá para tentar. */
export type Resultado = { saidas: SaidaPronta[]; aviso: string | null; compressao?: { nivel: string; ganho: number; proximo: string | null; jaComprimido: boolean } };
export type AoProgresso = (fracao: number, etapa: string) => void;
/** O que toda tarefa recebe: onde contar o andamento e o sinal de "cancelado pela pessoa". */
export type Contexto = { aoProgresso: AoProgresso; sinal?: AbortSignal };
export type De<O extends EntradaTarefa['operacao']> = Extract<EntradaTarefa, { operacao: O }>;

export function saidaPdf(nome: string, bytes: Uint8Array): SaidaPronta {
  return { nome, blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }) };
}

export async function bytesDe(arquivo: File): Promise<Uint8Array> {
  return new Uint8Array(await arquivo.arrayBuffer());
}

/** Abre, usa e fecha o PDF (o pdf.js segura memória no worker dele até o destroy). */
export async function comPdf<T>(arquivo: File, usar: (doc: PDFDocumentProxy) => Promise<T>): Promise<T> {
  const doc = await abrirPdf(await bytesDe(arquivo), arquivo.name);
  try {
    return await usar(doc);
  } finally {
    await doc.loadingTask.destroy();
  }
}

/** Juntar no pdf.js grava o PDF novo sem a restrição do autor: com arquivo restrito, recusa em vez de tirar a proteção. */
export async function recusarRestrito(doc: PDFDocumentProxy, nome: string): Promise<void> {
  if ((await doc.getPermissions()) === null) return; // null = sem restrição
  throw new Error(`O autor de "${nome}" restringiu o PDF, e juntar tiraria essa proteção. Use uma cópia sem restrição.`);
}

/** Total de páginas de um PDF que vai entrar num juntar. */
export async function paginasParaJuntar(bytes: Uint8Array, nome: string): Promise<number> {
  const doc = await abrirPdf(bytes.slice(), nome);
  try {
    await recusarRestrito(doc, nome);
    return doc.numPages;
  } finally {
    await doc.loadingTask.destroy();
  }
}

/** Todas as páginas, remontadas pelo pdf.js: assim o pdf-lib abre também PDF com estrutura danificada. A restrição do autor continua, e aí ele recusa. */
export function remontado(doc: PDFDocumentProxy): Promise<Uint8Array> {
  return montarPdf(doc, [{ document: null }], doc.numPages);
}

/** Remonta com o pdf.js e aplica uma edição do pdf-lib no worker (numerar, carimbar, girar, limpar, A4). */
export async function editarArquivo(arquivo: File, pedido: (bytes: Uint8Array) => PedidoEdicao, ctx: Contexto): Promise<{ bytes: Uint8Array; info?: string }> {
  return comPdf(arquivo, async (doc) => {
    ctx.aoProgresso(0.1, 'Lendo o PDF');
    const bytes = await remontado(doc);
    ctx.sinal?.throwIfAborted();
    ctx.aoProgresso(0.5, 'Aplicando nas páginas');
    return editarNoWorker(pedido(bytes), () => {});
  });
}

/** Mesmo nome do arquivo com um sufixo: "contrato-numerado.pdf". */
export function nomeCom(arquivo: File, sufixo: string, extensao = 'pdf'): string {
  return `${semExtensao(arquivo.name)}-${sufixo}.${extensao}`;
}
