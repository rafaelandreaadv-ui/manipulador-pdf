// Junta os pedaços de texto de uma página em linhas.
type LinhaPdf = { texto: string; x: number }[];
type ItemTexto = { str: string; transform: number[] };

/** Pedaços com |y| até esta distância são da mesma linha (texto da mesma linha costuma variar 1 a 2 pontos). */
const TOLERANCIA_Y = 2;

/** Agrupa os itens de uma página em linhas, de cima para baixo e da esquerda para a direita. */
export function linhasDaPagina(itens: ItemTexto[]): LinhaPdf[] {
  const pedacos = itens.filter((i) => i.str.trim()).map((i) => ({ texto: i.str, x: i.transform[4], y: i.transform[5] }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: { y: number; pedacos: { texto: string; x: number }[] }[] = [];
  for (const p of pedacos) {
    const atual = linhas[linhas.length - 1];
    if (atual && Math.abs(atual.y - p.y) <= TOLERANCIA_Y) atual.pedacos.push({ texto: p.texto, x: p.x });
    else linhas.push({ y: p.y, pedacos: [{ texto: p.texto, x: p.x }] });
  }
  return linhas.map((l) => l.pedacos.sort((a, b) => a.x - b.x));
}

