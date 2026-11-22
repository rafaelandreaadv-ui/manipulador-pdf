// Páginas digitadas pela pessoa no Manipulador de PDF ("1-3, 5, 8-"), sempre contadas a partir de 1.
// Nada é adivinhado: página que não existe, intervalo invertido ou texto estranho viram erro explicado na tela.

/** Cada grupo é um intervalo digitado, em índices do pdf.js (0 = primeira página), na ordem digitada. */
export type ResultadoIntervalos = { grupos: number[][] } | { erro: string };

const PARTE = /^(\d*)\s*(-?)\s*(\d*)$/;

function paginasDe(inicio: number, fim: number): number[] {
  return Array.from({ length: fim - inicio + 1 }, (_, i) => inicio - 1 + i);
}

function conferir(n: number, total: number): string | null {
  if (n < 1) return 'A primeira página é a 1.';
  if (n > total) return `A página ${n} não existe: o PDF tem ${total} ${total === 1 ? 'página' : 'páginas'}.`;
  return null;
}

/** Lê uma parte ("5", "2-4", "8-" até o fim, "-3" desde o início). */
function lerParte(parte: string, total: number): number[] | string {
  const m = PARTE.exec(parte);
  if (!m || (!m[1] && !m[3])) return `"${parte}" não é uma página nem um intervalo (ex.: 2-5).`;
  const temTraco = m[2] === '-';
  if (!temTraco && m[3]) return `"${parte}" não é uma página nem um intervalo (ex.: 2-5).`;
  const inicio = m[1] ? Number(m[1]) : 1;
  const fim = !temTraco ? inicio : m[3] ? Number(m[3]) : total;
  const erro = conferir(inicio, total) ?? conferir(fim, total);
  if (erro) return erro;
  if (inicio > fim) return `O intervalo ${inicio}-${fim} está invertido: use ${fim}-${inicio}.`;
  return paginasDe(inicio, fim);
}

/** "1-3, 5; 8-" em grupos de índices. Vírgula ou ponto e vírgula separam; travessão vale como hífen. */
export function lerIntervalos(texto: string, totalPaginas: number): ResultadoIntervalos {
  const partes = texto.replace(/[–—]/g, '-').split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  if (partes.length === 0) return { erro: 'Informe as páginas (ex.: 1-3, 5, 8-).' };
  const grupos: number[][] = [];
  for (const parte of partes) {
    const lido = lerParte(parte, totalPaginas);
    if (typeof lido === 'string') return { erro: lido };
    grupos.push(lido);
  }
  return { grupos };
}

/** Conjunto de páginas digitadas (sem repetição, em ordem crescente), para excluir ou girar só algumas. */
export function paginasDigitadas(texto: string, totalPaginas: number): { paginas: number[] } | { erro: string } {
  const lido = lerIntervalos(texto, totalPaginas);
  if ('erro' in lido) return lido;
  return { paginas: [...new Set(lido.grupos.flat())].sort((a, b) => a - b) };
}

/** Primeira página repetida (número de página, a partir de 1), ou null. */
export function paginaRepetida(ordem: number[]): number | null {
  const vistas = new Set<number>();
  for (const i of ordem) {
    if (vistas.has(i)) return i + 1;
    vistas.add(i);
  }
  return null;
}

/** Blocos de n páginas seguidas (o último pode ser menor), para "um PDF a cada n páginas". */
export function blocosDe(totalPaginas: number, n: number): number[][] {
  const blocos: number[][] = [];
  for (let inicio = 0; inicio < totalPaginas; inicio += n) {
    blocos.push(paginasDe(inicio + 1, Math.min(inicio + n, totalPaginas)));
  }
  return blocos;
}

/**
 * Ordem final de páginas (sem repetição) no formato do extractPages do pdf.js: as páginas mantidas em ordem
 * crescente (é assim que ele as percorre) e, para cada uma, a posição dela no arquivo novo.
 */
export function paraExtracao(ordem: number[]): { includePages: number[]; pageIndices: number[] } {
  const includePages = [...ordem].sort((a, b) => a - b);
  const posicao = new Map(ordem.map((pagina, i) => [pagina, i]));
  return { includePages, pageIndices: includePages.map((p) => posicao.get(p) as number) };
}

export type ModoDivisao = 'intervalos' | 'unico' | 'blocos';

/**
 * O que "Dividir ou extrair" vai gerar: um grupo de páginas por arquivo (ou um só, no modo "unico").
 * null enquanto o total de páginas não é conhecido.
 */
export function planoDeDivisao(modo: ModoDivisao, texto: string, bloco: string, total: number | null): ResultadoIntervalos | null {
  if (total === null) return null;
  if (modo === 'blocos') {
    const n = Number(bloco);
    return Number.isInteger(n) && n >= 1 ? { grupos: blocosDe(total, n) } : { erro: 'Informe de quantas em quantas páginas (1 ou mais).' };
  }
  const lido = lerIntervalos(texto, total);
  if ('erro' in lido || modo === 'intervalos') return lido;
  const repetida = paginaRepetida(lido.grupos.flat());
  return repetida ? { erro: `A página ${repetida} aparece mais de uma vez: no arquivo único cada página entra uma vez.` } : lido;
}

/**
 * Agrupa páginas seguidas até o limite, somando o tamanho de cada página sozinha (soma que fica acima do real, porque
 * fontes e imagens repetidas contam uma vez só no arquivo junto). Página maior que o limite fica sozinha num grupo.
 */
export function gruposPorTamanho(tamanhos: number[], limite: number): number[][] {
  const grupos: number[][] = [];
  let atual: number[] = [];
  let soma = 0;
  tamanhos.forEach((tamanho, pagina) => {
    if (atual.length && soma + tamanho > limite) {
      grupos.push(atual);
      [atual, soma] = [[], 0];
    }
    atual.push(pagina);
    soma += tamanho;
  });
  if (atual.length) grupos.push(atual);
  return grupos;
}

/** Cópia da lista com o item da posição "de" levado para a posição "para". */
export function moverItem<T>(lista: T[], de: number, para: number): T[] {
  const nova = [...lista];
  const [item] = nova.splice(de, 1);
  nova.splice(para, 0, item);
  return nova;
}

/** Texto curto de um grupo para nome de arquivo e rótulo: "1-3" ou "5". */
export function rotuloGrupo(grupo: number[]): string {
  const [primeira, ultima] = [grupo[0] + 1, grupo[grupo.length - 1] + 1];
  return primeira === ultima ? String(primeira) : `${primeira}-${ultima}`;
}
