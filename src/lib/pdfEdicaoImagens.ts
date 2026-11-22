// Imagens com o pdf-lib, no Web Worker do Manipulador de PDF: montar PDF A4 a partir de fotos e refazer fotos JPEG menores.
// Só bytes entram e saem; o que depende de canvas (decodificar e redesenhar a foto) chega pronto do worker.
import { PDFArray, PDFDocument, PDFNumber, PDFRawStream, PDFRef, type PDFDict } from 'pdf-lib';
import { A4, N, SEM_METADADOS, abrir, salvar, type AoProgresso, type Jpeg, type Recodificar } from '@/lib/pdfEdicao';

const MARGEM_IMAGEM = 18;

/** Uma imagem por página A4 (deitada quando a imagem é mais larga), centrada e ajustada dentro de uma margem pequena. */
export async function montarPdfDeImagens(imagens: Jpeg[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create(SEM_METADADOS);
  for (const img of imagens) {
    const [lp, ap] = img.largura > img.altura ? [A4.altura, A4.largura] : [A4.largura, A4.altura];
    const escala = Math.min((lp - 2 * MARGEM_IMAGEM) / img.largura, (ap - 2 * MARGEM_IMAGEM) / img.altura);
    const [w, h] = [img.largura * escala, img.altura * escala];
    const embutida = await doc.embedJpg(img.jpeg);
    doc.addPage([lp, ap]).drawImage(embutida, { x: (lp - w) / 2, y: (ap - h) / 2, width: w, height: h });
  }
  return salvar(doc);
}

function filtroSoDct(d: PDFDict): boolean {
  const f = d.lookup(N('Filter'));
  return f === N('DCTDecode') || (f instanceof PDFArray && f.size() === 1 && f.lookup(0) === N('DCTDecode'));
}

/** Só RGB e cinza (direto ou por perfil ICC de 1 ou 3 canais): CMYK e cores especiais ficam como estão. */
function corSegura(d: PDFDict): boolean {
  const cs = d.lookup(N('ColorSpace'));
  if (cs === N('DeviceRGB') || cs === N('DeviceGray')) return true;
  if (!(cs instanceof PDFArray) || cs.lookup(0) !== N('ICCBased')) return false;
  const perfil = cs.lookup(1);
  const canais = perfil instanceof PDFRawStream ? perfil.dict.lookup(N('N')) : undefined;
  return canais instanceof PDFNumber && [1, 3].includes(canais.asNumber());
}

/** Foto JPEG comum dentro do PDF, que dá para refazer menor sem mudar o desenho da página. */
export function imagemRecomprimivel(obj: unknown): obj is PDFRawStream {
  if (!(obj instanceof PDFRawStream)) return false;
  const d = obj.dict;
  const semAjustes = !d.has(N('Decode')) && !d.has(N('ImageMask')) && !d.has(N('SMaskInData')) && !d.has(N('Mask'));
  return d.lookup(N('Subtype')) === N('Image') && filtroSoDct(d) && corSegura(d) && semAjustes;
}

/** Imagens usadas como máscara de transparência de outra (/SMask, /Mask): precisam continuar em cinza, então não são refeitas. */
function mascaras(doc: PDFDocument): Set<PDFRef> {
  const refs = new Set<PDFRef>();
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    for (const chave of ['SMask', 'Mask']) {
      const alvo = obj.dict.get(N(chave));
      if (alvo instanceof PDFRef) refs.add(alvo);
    }
  }
  return refs;
}

function dimensao(d: PDFDict, chave: string): number {
  const v = d.lookup(N(chave));
  return v instanceof PDFNumber ? v.asNumber() : 0;
}

function trocarImagem(doc: PDFDocument, ref: PDFRef, antiga: PDFRawStream, nova: Jpeg) {
  const dict = antiga.dict.clone(doc.context);
  dict.set(N('Width'), PDFNumber.of(nova.largura));
  dict.set(N('Height'), PDFNumber.of(nova.altura));
  dict.set(N('ColorSpace'), N('DeviceRGB'));
  dict.set(N('BitsPerComponent'), PDFNumber.of(8));
  dict.set(N('Filter'), N('DCTDecode'));
  dict.delete(N('DecodeParms'));
  doc.context.assign(ref, PDFRawStream.of(dict, nova.jpeg));
}

/** Refaz as fotos JPEG menores; o texto continua texto. Só troca a imagem quando ela fica ao menos 10% menor. */
export async function comprimirImagens(bytes: Uint8Array, recodificar: Recodificar, aoProgresso: AoProgresso): Promise<{ bytes: Uint8Array; trocadas: number; total: number }> {
  const doc = await abrir(bytes);
  const deMascara = mascaras(doc);
  const imagens = doc.context.enumerateIndirectObjects().filter((par): par is [PDFRef, PDFRawStream] => imagemRecomprimivel(par[1]) && !deMascara.has(par[0]));
  let trocadas = 0;
  for (const [i, [ref, img]] of imagens.entries()) {
    aoProgresso(i / Math.max(1, imagens.length), `Imagem ${i + 1} de ${imagens.length}`);
    const nova = await recodificar(img.contents, dimensao(img.dict, 'Width'), dimensao(img.dict, 'Height'));
    if (!nova || nova.jpeg.length >= img.contents.length * 0.9) continue;
    trocarImagem(doc, ref, img, nova);
    trocadas++;
  }
  return { bytes: await salvar(doc), trocadas, total: imagens.length };
}
