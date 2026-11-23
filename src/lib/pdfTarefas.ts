// Executa uma tarefa da fila do Manipulador de PDF, toda na memória desta aba: o pdf.js (no worker dele) monta e
// desenha páginas; o pdf-lib (no nosso worker) gira, numera, carimba, comprime e monta PDF de imagens.
// Qualquer falha vira mensagem para a pessoa; nada é entregue pela metade. As operações novas ficam em pdfTarefasExtras.ts.
import { semExtensao } from '@/lib/ferramentas';
import { NIVEIS_COMPRESSAO, tamanhoLegivel, type EntradaTarefa, type NivelCompressao, type OperacaoPdf } from '@/lib/filaPdf';
import type { PaginaJpeg } from '@/lib/pdfEdicao';
import { editarNoWorker } from '@/lib/pdfEdicaoCliente';
import { paginaRepetida, paraExtracao, rotuloGrupo } from '@/lib/pdfIntervalos';
import { cederVez, desenharEmBitmap, montarPdf, type EntradaMontagem, type PDFDocumentProxy } from '@/lib/pdfLeitura';
import {
  bytesDe, comPdf, editarArquivo, nomeCom, paginasParaJuntar, recusarRestrito, remontado, saidaPdf,
  type AoProgresso, type Contexto, type De, type Resultado, type SaidaPronta,
} from '@/lib/pdfTarefasBase';
import { EXTRAS } from '@/lib/pdfTarefasExtras';

export type { Resultado, SaidaPronta, AoProgresso };

async function juntar(e: De<'juntar'>, ctx: Contexto): Promise<Resultado> {
  const [primeiro, ...outros] = e.arquivos;
  return comPdf(primeiro, async (doc) => {
    const entradas: EntradaMontagem[] = [{ document: null }];
    let esperadas = doc.numPages;
    await recusarRestrito(doc, primeiro.name);
    for (const [i, arquivo] of outros.entries()) {
      ctx.sinal?.throwIfAborted();
      ctx.aoProgresso(((i + 1) / e.arquivos.length) * 0.6, `Lendo ${i + 2} de ${e.arquivos.length}`);
      const bytes = await bytesDe(arquivo);
      esperadas += await paginasParaJuntar(bytes, arquivo.name);
      entradas.push({ document: bytes });
    }
    ctx.aoProgresso(0.7, 'Juntando');
    return { saidas: [saidaPdf(nomeCom(primeiro, 'juntado'), await montarPdf(doc, entradas, esperadas))], aviso: null };
  });
}

async function dividir(e: De<'dividir'>, ctx: Contexto): Promise<Resultado> {
  const base = semExtensao(e.arquivo.name);
  return comPdf(e.arquivo, async (doc) => {
    if (e.umArquivo) {
      const ordem = e.grupos.flat();
      const repetida = paginaRepetida(ordem);
      if (repetida) throw new Error(`A página ${repetida} aparece mais de uma vez. No arquivo único, cada página entra uma vez.`);
      const rotulo = e.grupos.length <= 3 ? e.grupos.map(rotuloGrupo).join('_') : 'selecionadas';
      return { saidas: [saidaPdf(`${base}-paginas-${rotulo}.pdf`, await montarPdf(doc, [{ document: null, ...paraExtracao(ordem) }], ordem.length))], aviso: null };
    }
    const saidas: SaidaPronta[] = [];
    for (const [i, grupo] of e.grupos.entries()) {
      ctx.sinal?.throwIfAborted();
      ctx.aoProgresso(i / e.grupos.length, `Parte ${i + 1} de ${e.grupos.length}`);
      saidas.push(saidaPdf(`${base}-paginas-${rotuloGrupo(grupo)}.pdf`, await montarPdf(doc, [{ document: null, ...paraExtracao(grupo) }], grupo.length)));
    }
    return { saidas, aviso: null };
  });
}

async function organizar(e: De<'organizar'>, ctx: Contexto): Promise<Resultado> {
  return comPdf(e.arquivo, async (doc) => {
    const ordem = e.paginas.map((p) => p.indice);
    ctx.aoProgresso(0.2, 'Montando a nova ordem');
    let bytes = await montarPdf(doc, [{ document: null, ...paraExtracao(ordem) }], ordem.length);
    if (e.paginas.some((p) => p.giro !== 0)) {
      ctx.sinal?.throwIfAborted();
      ctx.aoProgresso(0.6, 'Girando páginas');
      bytes = (await editarNoWorker({ tipo: 'girar', bytes, giros: e.paginas.map((p) => p.giro) }, () => {})).bytes;
    }
    return { saidas: [saidaPdf(nomeCom(e.arquivo, 'organizado'), bytes)], aviso: null };
  });
}

async function imagens(e: De<'imagens'>, ctx: Contexto): Promise<Resultado> {
  const { bytes } = await editarNoWorker({ tipo: 'imagens', arquivos: e.arquivos }, ctx.aoProgresso);
  return { saidas: [saidaPdf(`${semExtensao(e.arquivos[0].name)}.pdf`, bytes)], aviso: null };
}

async function paraImagens(e: De<'paraImagens'>, ctx: Contexto): Promise<Resultado> {
  const [base, extensao] = [semExtensao(e.arquivo.name), e.formato === 'png' ? 'png' : 'jpg'];
  return comPdf(e.arquivo, async (doc) => {
    const saidas: SaidaPronta[] = [];
    let reduzidas = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      ctx.sinal?.throwIfAborted();
      ctx.aoProgresso((n - 1) / doc.numPages, `Página ${n} de ${doc.numPages}`);
      const { bitmap, reduzida } = await desenharEmBitmap(doc, n, e.dpi / 72);
      ctx.sinal?.throwIfAborted();
      const tipo = `image/${e.formato}` as const;
      const { bytes } = await editarNoWorker({ tipo: 'codificar', imagem: bitmap, formato: tipo }, () => {});
      const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: tipo });
      saidas.push({ nome: `${base}-pagina-${String(n).padStart(Math.max(2, String(doc.numPages).length), '0')}.${extensao}`, blob });
      if (reduzida) reduzidas++;
      await cederVez();
    }
    const aviso = reduzidas ? `${reduzidas} ${reduzidas === 1 ? 'página muito grande saiu' : 'páginas muito grandes saíram'} com resolução menor (limite de memória do navegador).` : null;
    return { saidas, aviso };
  });
}

const PERDA: Record<NivelCompressao, string> = {
  equilibrada: '',
  forte: 'As fotos ficam mais suaves.',
  mais110: 'Fotos em cerca de 110 dpi: perdem nitidez, mas dá para ler na tela.',
  mais72: 'Fotos em cerca de 72 dpi: perdem bastante nitidez; letra pequena digitalizada pode ficar difícil de ler.',
  raster110: 'Cada página virou imagem (cerca de 110 dpi): o texto não pode mais ser selecionado, copiado nem buscado.',
  raster72: 'Cada página virou imagem (cerca de 72 dpi): o texto não pode mais ser selecionado, copiado nem buscado, e a leitura fica mais difícil.',
};
const RASTER: Partial<Record<NivelCompressao, { dpi: number; qualidade: number }>> = {
  raster110: { dpi: 110, qualidade: 0.5 },
  raster72: { dpi: 72, qualidade: 0.38 },
};

/** Desenha cada página (pdf.js) e monta um PDF só de imagens, no tamanho original das páginas. */
async function rasterizar(doc: PDFDocumentProxy, dpi: number, qualidade: number, ctx: Contexto, aoProgresso: AoProgresso): Promise<Uint8Array> {
  const paginas: PaginaJpeg[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    ctx.sinal?.throwIfAborted();
    aoProgresso((n - 1) / doc.numPages, `Página ${n} de ${doc.numPages}`);
    const { width, height } = (await doc.getPage(n)).getViewport({ scale: 1 });
    const { bitmap } = await desenharEmBitmap(doc, n, dpi / 72);
    const { bytes } = await editarNoWorker({ tipo: 'codificar', imagem: bitmap, formato: 'image/jpeg', qualidade }, () => {});
    paginas.push({ jpeg: bytes, largura: width, altura: height });
    await cederVez();
  }
  aoProgresso(0.97, 'Montando o PDF');
  return (await editarNoWorker({ tipo: 'paginasJpeg', paginas }, () => {})).bytes;
}

async function comprimir(e: De<'comprimir'>, ctx: Contexto): Promise<Resultado> {
  return comPdf(e.arquivo, async (doc) => {
    ctx.aoProgresso(0.05, 'Lendo o PDF');
    const base = await remontado(doc);
    const antes = e.arquivo.size, alvo = e.alvoMb ? e.alvoMb * 1024 * 1024 : null;
    // sem alvo: só o nível escolhido. Com alvo: sobe de nível até caber ou acabar.
    const niveis = NIVEIS_COMPRESSAO.slice(NIVEIS_COMPRESSAO.indexOf(e.nivel), alvo ? undefined : NIVEIS_COMPRESSAO.indexOf(e.nivel) + 1);
    let melhor: { bytes: Uint8Array; nivel: NivelCompressao; info: string } | null = null, nivel = e.nivel;
    for (const [k, n] of niveis.entries()) {
      ctx.sinal?.throwIfAborted();
      nivel = n;
      const parte = (f: number, etapa: string) => ctx.aoProgresso(0.1 + ((k + f) / niveis.length) * 0.85, niveis.length > 1 ? `Nível ${k + 1} de ${niveis.length}: ${etapa}` : etapa);
      const raster = RASTER[n];
      const r = raster
        ? { bytes: await rasterizar(doc, raster.dpi, raster.qualidade, ctx, parte), info: `${doc.numPages} ${doc.numPages === 1 ? 'página virou imagem' : 'páginas viraram imagem'}` }
        : await editarNoWorker({ tipo: 'comprimir', bytes: base.slice(), nivel: n }, parte);
      if (!melhor || r.bytes.length < melhor.bytes.length) melhor = { bytes: r.bytes, nivel: n, info: r.info ?? '' };
      if (alvo && melhor.bytes.length <= alvo) break;
    }
    const proximo = NIVEIS_COMPRESSAO[NIVEIS_COMPRESSAO.indexOf(nivel) + 1] ?? null;
    const jaComprimido = /-comprimido\.pdf$/i.test(e.arquivo.name);
    // nunca entrega arquivo maior (nem quase igual) ao original
    if (!melhor || melhor.bytes.length >= antes * 0.98) {
      return { saidas: [], aviso: `Sem ganho neste nível: o PDF continua com ${tamanhoLegivel(antes)}. Não há arquivo novo para baixar.`, compressao: { nivel, ganho: 0, proximo, jaComprimido } };
    }
    const depois = melhor.bytes.length, ganho = 1 - depois / antes;
    const faltou = alvo && depois > alvo ? ` Não chegou em ${e.alvoMb!.toLocaleString('pt-BR')} MB nem no nível mais forte: divida o arquivo.` : '';
    const aviso = `${tamanhoLegivel(antes)} → ${tamanhoLegivel(depois)} (−${Math.round(ganho * 100)}%; ${melhor.info}). ${PERDA[melhor.nivel]}${faltou}`.trim();
    const proximoDoMelhor = NIVEIS_COMPRESSAO[NIVEIS_COMPRESSAO.indexOf(melhor.nivel) + 1] ?? null;
    return { saidas: [saidaPdf(jaComprimido ? e.arquivo.name : nomeCom(e.arquivo, 'comprimido'), melhor.bytes)], aviso, compressao: { nivel: melhor.nivel, ganho, proximo: proximoDoMelhor, jaComprimido } };
  });
}

async function numerar(e: De<'numerar'>, ctx: Contexto): Promise<Resultado> {
  const opcoes = { posicao: e.posicao, formato: e.formato, inicio: e.inicio };
  const { bytes } = await editarArquivo(e.arquivo, (b) => ({ tipo: 'numerar', bytes: b, opcoes }), ctx);
  return { saidas: [saidaPdf(nomeCom(e.arquivo, 'numerado'), bytes)], aviso: null };
}

async function marcaDagua(e: De<'marcaDagua'>, ctx: Contexto): Promise<Resultado> {
  const opcoes = { texto: e.texto, opacidade: e.opacidade };
  const { bytes } = await editarArquivo(e.arquivo, (b) => ({ tipo: 'marcaDagua', bytes: b, opcoes }), ctx);
  return { saidas: [saidaPdf(nomeCom(e.arquivo, 'marca-dagua'), bytes)], aviso: null };
}

type Executores = { [O in OperacaoPdf]: (e: De<O>, ctx: Contexto) => Promise<Resultado> };

const EXECUTORES: Executores = { juntar, dividir, organizar, imagens, paraImagens, comprimir, numerar, marcaDagua, ...EXTRAS };

export function executarTarefa(entrada: EntradaTarefa, aoProgresso: AoProgresso, sinal?: AbortSignal): Promise<Resultado> {
  const executar = EXECUTORES[entrada.operacao] as (e: EntradaTarefa, ctx: Contexto) => Promise<Resultado>;
  return executar(entrada, { aoProgresso, sinal });
}
