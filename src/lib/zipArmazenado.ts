// ZIP sem compressão ("armazenado") para entregar várias saídas num download só (PDF em imagens, PDF dividido).
// Imagem e PDF já vêm comprimidos: comprimir de novo quase não reduz e custa tempo. Feito à mão para não trazer
// dependência só por isso (formato: APPNOTE do PKZIP, seções 4.3.7, 4.3.12 e 4.3.16).

export type ArquivoZip = { nome: string; dados: Uint8Array };
type Campo = [posicao: number, bytes: 2 | 4, valor: number];

let tabelaCrc: Uint32Array | null = null;

function tabela(): Uint32Array {
  if (tabelaCrc) return tabelaCrc;
  tabelaCrc = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabelaCrc[n] = c >>> 0;
  }
  return tabelaCrc;
}

export function crc32(dados: Uint8Array): number {
  const t = tabela();
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = t[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Data e hora no formato do MS-DOS, que é o que o ZIP guarda. */
function dataDos(d: Date): { hora: number; dia: number } {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    dia: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function bloco(tamanho: number, campos: Campo[], nome: Uint8Array): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(tamanho + nome.length);
  const v = new DataView(b.buffer);
  for (const [pos, bytes, valor] of campos) {
    if (bytes === 2) v.setUint16(pos, valor, true);
    else v.setUint32(pos, valor, true);
  }
  b.set(nome, tamanho);
  return b;
}

/** Nomes repetidos ganham " (2)", " (3)"... antes da extensão: o ZIP aceitaria, mas quem abre só veria um. */
function nomeLivre(nome: string, usados: Set<string>): string {
  let livre = nome;
  for (let n = 2; usados.has(livre); n++) livre = nome.replace(/(\.[^.]*)?$/, (ext) => ` (${n})${ext}`);
  usados.add(livre);
  return livre;
}

type Entrada = { nome: Uint8Array; crc: number; tamanho: number; posicao: number };

function centralDe(e: Entrada, d: { hora: number; dia: number }): Uint8Array<ArrayBuffer> {
  return bloco(46, [
    [0, 4, 0x02014b50], [4, 2, 20], [6, 2, 20], [8, 2, 0x0800], [10, 2, 0], [12, 2, d.hora], [14, 2, d.dia],
    [16, 4, e.crc], [20, 4, e.tamanho], [24, 4, e.tamanho], [28, 2, e.nome.length], [42, 4, e.posicao],
  ], e.nome);
}

export function criarZip(arquivos: ArquivoZip[], quando = new Date()): Blob {
  const d = dataDos(quando);
  const usados = new Set<string>();
  const partes: BlobPart[] = [];
  const entradas: Entrada[] = [];
  let posicao = 0;
  for (const arquivo of arquivos) {
    const e = { nome: new TextEncoder().encode(nomeLivre(arquivo.nome, usados)), crc: crc32(arquivo.dados), tamanho: arquivo.dados.length, posicao };
    const local = bloco(30, [
      [0, 4, 0x04034b50], [4, 2, 20], [6, 2, 0x0800], [8, 2, 0], [10, 2, d.hora], [12, 2, d.dia],
      [14, 4, e.crc], [18, 4, e.tamanho], [22, 4, e.tamanho], [26, 2, e.nome.length],
    ], e.nome);
    partes.push(local, arquivo.dados as Uint8Array<ArrayBuffer>);
    entradas.push(e);
    posicao += local.length + e.tamanho;
  }
  const central = entradas.map((e) => centralDe(e, d));
  const tamanhoCentral = central.reduce((s, b) => s + b.length, 0);
  const fim = bloco(22, [[0, 4, 0x06054b50], [8, 2, entradas.length], [10, 2, entradas.length], [12, 4, tamanhoCentral], [16, 4, posicao]], new Uint8Array());
  return new Blob([...partes, ...central, fim], { type: 'application/zip' });
}
