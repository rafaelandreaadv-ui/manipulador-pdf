// Tipos das 16 operações. Os arquivos ficam só na memória da aba.

export type OperacaoPdf =
  | 'juntar' | 'dividir' | 'dividirTamanho' | 'organizar' | 'excluir' | 'girar' | 'a4'
  | 'imagens' | 'paraImagens' | 'texto'
  | 'numerar' | 'documentos' | 'cabecalho' | 'marcaDagua'
  | 'comprimir' | 'metadados';

export type Giro = 0 | 90 | 180 | 270;
export type PaginaOrganizada = { indice: number; giro: Giro };
export type PosicaoTexto = 'superior-esquerda' | 'superior-centro' | 'superior-direita' | 'inferior-esquerda' | 'inferior-centro' | 'inferior-direita';
export type PosicaoNumero = PosicaoTexto;
export type FormatoNumero = 'n' | 'pagina-n-de-t' | 'n-de-t';
export type RotuloDocumento = 'Doc.' | 'Documento' | 'Anexo';

export type EntradaTarefa =
  | { operacao: 'juntar'; arquivos: File[] }
  | { operacao: 'dividir'; arquivo: File; grupos: number[][]; umArquivo: boolean }
  | { operacao: 'dividirTamanho'; arquivo: File; limiteMb: number }
  | { operacao: 'organizar'; arquivo: File; paginas: PaginaOrganizada[] }
  /** paginas: índices (base 0) que saem do PDF. */
  | { operacao: 'excluir'; arquivo: File; paginas: number[] }
  /** paginas null = todas. */
  | { operacao: 'girar'; arquivo: File; giro: 90 | 180 | 270; paginas: number[] | null }
  | { operacao: 'a4'; arquivo: File }
  | { operacao: 'imagens'; arquivos: File[] }
  | { operacao: 'paraImagens'; arquivo: File; formato: 'jpeg' | 'png'; dpi: number }
  | { operacao: 'texto'; arquivo: File }
  | { operacao: 'numerar'; arquivo: File; posicao: PosicaoNumero; formato: FormatoNumero; inicio: number }
  | { operacao: 'documentos'; arquivos: File[]; rotulo: RotuloDocumento; inicio: number; todasPaginas: boolean }
  | { operacao: 'cabecalho'; arquivo: File; texto: string; posicao: PosicaoTexto; soPrimeira: boolean }
  | { operacao: 'marcaDagua'; arquivo: File; texto: string; opacidade: number }
  | { operacao: 'comprimir'; arquivo: File; nivel: 'equilibrada' | 'forte' }
  | { operacao: 'metadados'; arquivo: File };

/** "2,4 MB": tamanho legível, com espaço não separável. */
export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes}\u00a0B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)}\u00a0KB`;
  return `${(kb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}\u00a0MB`;
}
