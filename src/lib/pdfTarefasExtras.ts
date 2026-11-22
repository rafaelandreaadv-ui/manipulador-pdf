// Operações do segundo lote do Manipulador de PDF: excluir, girar, dividir por tamanho, ajustar para A4, PDF em texto,
// numerar documentos anexos, cabeçalho/rodapé e remover metadados. Mesma regra: tudo na memória da aba, erro explicado.
import { rotuloDocumento, semExtensao } from '@/lib/ferramentas';
import { tamanhoLegivel } from '@/lib/filaPdf';
import { editarNoWorker } from '@/lib/pdfEdicaoCliente';
import { gruposPorTamanho, paraExtracao } from '@/lib/pdfIntervalos';
import { linhasDaPagina } from '@/lib/lerPdfNavegador';
import { cederVez, extrairBytes, montarPdf, type PDFDocumentProxy } from '@/lib/pdfLeitura';
import { comPdf, editarArquivo, nomeCom, remontado, saidaPdf, type Contexto, type De, type Resultado } from '@/lib/pdfTarefasBase';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

async function excluir(e: De<'excluir'>, ctx: Contexto): Promise<Resultado> {
  return comPdf(e.arquivo, async (doc) => {
    if (!e.paginas.length) throw new Error('Escolha ao menos uma página para excluir.');
    if (e.paginas.some((i) => i < 0 || i >= doc.numPages)) throw new Error(`Há página fora do PDF, que tem ${doc.numPages} páginas.`);
    const fora = new Set(e.paginas);
    const ficam = Array.from({ length: doc.numPages }, (_, i) => i).filter((i) => !fora.has(i));
    if (!ficam.length) throw new Error('Não sobraria nenhuma página: deixe ao menos uma.');
    ctx.aoProgresso(0.3, 'Montando o PDF sem as páginas');
    const bytes = await montarPdf(doc, [{ document: null, ...paraExtracao(ficam) }], ficam.length);
    const aviso = `${plural(fora.size, 'página excluída', 'páginas excluídas')}; ${plural(ficam.length, 'ficou', 'ficaram')}.`;
    return { saidas: [saidaPdf(nomeCom(e.arquivo, 'paginas-excluidas'), bytes)], aviso };
  });
}

async function girar(e: De<'girar'>, ctx: Contexto): Promise<Resultado> {
  const escolhidas = e.paginas ? new Set(e.paginas) : null;
  return comPdf(e.arquivo, async (doc) => {
    const giros = Array.from({ length: doc.numPages }, (_, i) => (!escolhidas || escolhidas.has(i) ? e.giro : 0));
    ctx.aoProgresso(0.2, 'Lendo o PDF');
    const bytes = await remontado(doc);
    ctx.sinal?.throwIfAborted();
    ctx.aoProgresso(0.6, 'Girando páginas');
    const r = await editarNoWorker({ tipo: 'girar', bytes, giros }, () => {});
    return { saidas: [saidaPdf(nomeCom(e.arquivo, 'girado'), r.bytes)], aviso: null };
  });
}

/** Tamanho de cada página sozinha (um PDF de uma página por vez). */
async function medirPaginas(doc: PDFDocumentProxy, ctx: Contexto): Promise<number[]> {
  const tamanhos: number[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    ctx.sinal?.throwIfAborted();
    ctx.aoProgresso((i / doc.numPages) * 0.6, `Medindo a página ${i + 1} de ${doc.numPages}`);
    tamanhos.push((await extrairBytes(doc, [{ document: null, includePages: [i] }])).length);
  }
  return tamanhos;
}

type Parte = { bytes: Uint8Array; grupo: number[] };

/** Monta o grupo; se ainda passar do limite (raro: a medida soma por cima), parte ao meio até caber. */
async function partesAte(doc: PDFDocumentProxy, grupo: number[], limite: number): Promise<Parte[]> {
  const bytes = await montarPdf(doc, [{ document: null, ...paraExtracao(grupo) }], grupo.length);
  if (bytes.length <= limite || grupo.length === 1) return [{ bytes, grupo }];
  const meio = Math.ceil(grupo.length / 2);
  return [...(await partesAte(doc, grupo.slice(0, meio), limite)), ...(await partesAte(doc, grupo.slice(meio), limite))];
}

function avisoDasPartes(partes: Parte[], limite: number, limiteMb: number): string {
  const grandes = partes.filter((p) => p.bytes.length > limite).map((p) => p.grupo[0] + 1);
  const base = `${plural(partes.length, 'parte', 'partes')} de até ${limiteMb.toLocaleString('pt-BR')} MB.`;
  if (!grandes.length) return base;
  return `${base} Atenção: ${grandes.length === 1 ? 'a página' : 'as páginas'} ${grandes.join(', ')} sozinha${grandes.length === 1 ? '' : 's'} já passa${grandes.length === 1 ? '' : 'm'} do limite; comprima antes.`;
}

async function dividirTamanho(e: De<'dividirTamanho'>, ctx: Contexto): Promise<Resultado> {
  const limite = e.limiteMb * 1_000_000; // MB decimal: a parte fica dentro do limite nas duas contas que os sistemas usam
  if (e.arquivo.size <= limite) return { saidas: [], aviso: `O PDF tem ${tamanhoLegivel(e.arquivo.size)}, já abaixo de ${e.limiteMb} MB: não precisa dividir.` };
  return comPdf(e.arquivo, async (doc) => {
    const grupos = gruposPorTamanho(await medirPaginas(doc, ctx), limite);
    const partes: Parte[] = [];
    for (const [i, grupo] of grupos.entries()) {
      ctx.sinal?.throwIfAborted();
      ctx.aoProgresso(0.6 + (i / grupos.length) * 0.4, `Montando a parte ${i + 1} de ${grupos.length}`);
      partes.push(...(await partesAte(doc, grupo, limite)));
    }
    const base = semExtensao(e.arquivo.name);
    const saidas = partes.map((p, i) => saidaPdf(`${base}-parte-${String(i + 1).padStart(2, '0')}.pdf`, p.bytes));
    return { saidas, aviso: avisoDasPartes(partes, limite, e.limiteMb) };
  });
}

async function a4(e: De<'a4'>, ctx: Contexto): Promise<Resultado> {
  const r = await editarArquivo(e.arquivo, (bytes) => ({ tipo: 'a4', bytes }), ctx);
  return { saidas: [saidaPdf(nomeCom(e.arquivo, 'a4'), r.bytes)], aviso: `${r.info}. Página redesenhada em A4 perde links e campos de formulário.` };
}

const BOM = String.fromCharCode(0xfeff); // o Bloco de Notas antigo do Windows lê os acentos certo com ele

async function textoDaPagina(doc: PDFDocumentProxy, n: number): Promise<string> {
  const pagina = await doc.getPage(n);
  const conteudo = await pagina.getTextContent();
  pagina.cleanup();
  const itens = conteudo.items.flatMap((i) => ('str' in i ? [{ str: i.str, transform: i.transform }] : []));
  return linhasDaPagina(itens).map((linha) => linha.map((p) => p.texto).join(' ').replace(/\s{2,}/g, ' ').trim()).join('\n');
}

async function texto(e: De<'texto'>, ctx: Contexto): Promise<Resultado> {
  return comPdf(e.arquivo, async (doc) => {
    const paginas: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      ctx.sinal?.throwIfAborted();
      ctx.aoProgresso((n - 1) / doc.numPages, `Página ${n} de ${doc.numPages}`);
      paginas.push(await textoDaPagina(doc, n));
      await cederVez();
    }
    if (!paginas.some((p) => p.trim())) return { saidas: [], aviso: 'Este PDF não tem texto (parece digitalizado): não há o que extrair sem reconhecimento de texto (OCR).' };
    const corpo = paginas.map((p, i) => `--- Página ${i + 1} ---\n${p}`).join('\n\n');
    return { saidas: [{ nome: `${semExtensao(e.arquivo.name)}.txt`, blob: new Blob([BOM, corpo], { type: 'text/plain;charset=utf-8' }) }], aviso: null };
  });
}

async function documentos(e: De<'documentos'>, ctx: Contexto): Promise<Resultado> {
  const saidas = [];
  for (const [i, arquivo] of e.arquivos.entries()) {
    ctx.sinal?.throwIfAborted();
    ctx.aoProgresso(i / e.arquivos.length, `Documento ${i + 1} de ${e.arquivos.length}`);
    const rotulo = rotuloDocumento(e.rotulo, e.inicio + i);
    const opcoes = { texto: rotulo, posicao: 'superior-direita' as const, soPrimeira: !e.todasPaginas, tamanho: 14, caixa: true, negrito: true };
    const { bytes } = await editarArquivo(arquivo, (b) => ({ tipo: 'carimbar', bytes: b, opcoes }), { aoProgresso: () => {}, sinal: ctx.sinal });
    saidas.push(saidaPdf(`${rotulo} - ${semExtensao(arquivo.name)}.pdf`, bytes));
  }
  const intervalo = `${rotuloDocumento(e.rotulo, e.inicio)} a ${rotuloDocumento(e.rotulo, e.inicio + saidas.length - 1)}`;
  return { saidas, aviso: saidas.length > 1 ? `Numerados de ${intervalo}.` : null };
}

async function cabecalho(e: De<'cabecalho'>, ctx: Contexto): Promise<Resultado> {
  const opcoes = { texto: e.texto, posicao: e.posicao, soPrimeira: e.soPrimeira, tamanho: 10, caixa: false, negrito: false };
  const { bytes } = await editarArquivo(e.arquivo, (b) => ({ tipo: 'carimbar', bytes: b, opcoes }), ctx);
  return { saidas: [saidaPdf(nomeCom(e.arquivo, 'com-texto'), bytes)], aviso: null };
}

const CAMPOS_INFO: Record<string, string> = {
  Title: 'título', Author: 'autor', Subject: 'assunto', Keywords: 'palavras-chave',
  Creator: 'programa de origem', Producer: 'gerador do PDF', CreationDate: 'data de criação', ModDate: 'data de alteração',
};

/** Nomes (em português) das informações que o PDF original tinha gravadas. */
async function informacoesGravadas(doc: PDFDocumentProxy): Promise<string[]> {
  const { info, metadata } = await doc.getMetadata();
  const valores = info as Record<string, unknown>;
  const nomes = Object.entries(CAMPOS_INFO).filter(([chave]) => typeof valores[chave] === 'string' && String(valores[chave]).trim()).map(([, nome]) => nome);
  return metadata ? [...nomes, 'metadados XMP'] : nomes;
}

async function metadados(e: De<'metadados'>, ctx: Contexto): Promise<Resultado> {
  return comPdf(e.arquivo, async (doc) => {
    const presentes = await informacoesGravadas(doc);
    ctx.aoProgresso(0.3, 'Limpando as informações do documento');
    const bytes = await remontado(doc);
    ctx.sinal?.throwIfAborted();
    const r = await editarNoWorker({ tipo: 'metadados', bytes }, () => {});
    const aviso = presentes.length ? `Removido: ${presentes.join(', ')}.` : 'O PDF não tinha título, autor nem outras informações gravadas; o novo também não tem.';
    return { saidas: [saidaPdf(nomeCom(e.arquivo, 'sem-metadados'), r.bytes)], aviso };
  });
}

export const EXTRAS = { excluir, girar, dividirTamanho, a4, texto, documentos, cabecalho, metadados };
