// Peças de tela e de nome de arquivo. Tudo roda no navegador.
import type { EntradaTarefa, OperacaoPdf } from '@/lib/filaPdf';

export function semExtensao(nome: string): string {
  return nome.replace(/\.[^.]+$/, '').trim() || 'documento';
}

/** Nome do ZIP com todas as saídas de uma tarefa (PDF em imagens ou PDF dividido). */
export function nomeDoZip(entrada: EntradaTarefa): string {
  if (entrada.operacao === 'documentos') return 'documentos-numerados.zip';
  const principal = 'arquivo' in entrada ? entrada.arquivo : entrada.arquivos[0];
  return `${semExtensao(principal?.name ?? 'documento')}-${entrada.operacao === 'paraImagens' ? 'imagens' : 'partes'}.zip`;
}

/** Baixa pelo próprio navegador (link com download): o arquivo vai direto para a pasta de downloads. */
export function baixarArquivo(url: string, nome: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Caracteres que a fonte padrão do PDF (WinAnsi) escreve: latim com acentos e a pontuação comum. */
const TEXTO_ACEITO = /^[\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]+$/;

export function textoAceitoNoPdf(texto: string): boolean {
  return TEXTO_ACEITO.test(texto);
}

/** Rótulo do documento anexo com dois dígitos: "Doc. 01", "Anexo 12". */
export function rotuloDocumento(rotulo: string, numero: number): string {
  return `${rotulo} ${String(numero).padStart(2, '0')}`;
}

/** Operações que recebem vários PDFs de uma vez. */
const RECEBEM_VARIOS: OperacaoPdf[] = ['juntar', 'documentos'];
/** Todas as que recebem PDF (a de imagens recebe JPG/PNG/WebP). */
const RECEBEM_PDF: OperacaoPdf[] = [
  'juntar', 'dividir', 'dividirTamanho', 'organizar', 'excluir', 'girar', 'a4', 'paraImagens', 'texto',
  'numerar', 'documentos', 'cabecalho', 'marcaDagua', 'comprimir', 'metadados',
];

const ehPdf = (s: { nome: string; blob: Blob }) => s.blob.type === 'application/pdf' || /\.pdf$/i.test(s.nome);

/** Para onde o resultado de uma tarefa pode seguir ("usar em outra ferramenta"): só PDF; vários só para quem recebe vários. */
export function destinosDoResultado(saidas: { nome: string; blob: Blob }[], origem: OperacaoPdf): OperacaoPdf[] {
  if (!saidas.length || !saidas.every(ehPdf)) return [];
  const possiveis = saidas.length > 1 ? RECEBEM_VARIOS : RECEBEM_PDF;
  return possiveis.filter((o) => o !== origem);
}
