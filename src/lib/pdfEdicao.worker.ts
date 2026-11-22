// Web Worker do Manipulador de PDF: edita com o pdf-lib fora da tela, para a interface não travar.
// Recebe e devolve bytes pela memória (postMessage). Sem rede, sem armazenamento, sem log.
import {
  ErroAmigavel, ajustarParaA4, aplicarMarcaDagua, carimbarTexto, girarPaginas, limparMetadados, numerarPaginas,
  type AoProgresso, type Jpeg, type MensagemWorker, type NivelCompressao, type PedidoEdicao,
} from '@/lib/pdfEdicao';
import { comprimirImagens, montarPdfDeImagens } from '@/lib/pdfEdicaoImagens';

type Escopo = {
  onmessage: ((e: MessageEvent<{ id: number; pedido: PedidoEdicao }>) => void) | null;
  postMessage: (m: MensagemWorker, transferir?: Transferable[]) => void;
};
const escopo = self as unknown as Escopo;

/** Foto de documento: até 2480 px no lado maior (A4 a 300 dpi), suficiente para leitura e impressão. */
const LADO_FOTO = 2480;
const COMPRESSAO: Record<NivelCompressao, { lado: number; qualidade: number }> = {
  equilibrada: { lado: 1800, qualidade: 0.72 },
  forte: { lado: 1240, qualidade: 0.55 },
};

async function desenharJpeg(bitmap: ImageBitmap, ladoMax: number, qualidade: number): Promise<Jpeg> {
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const [largura, altura] = [Math.max(1, Math.round(bitmap.width * escala)), Math.max(1, Math.round(bitmap.height * escala))];
  const canvas = new OffscreenCanvas(largura, altura);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ErroAmigavel('O navegador não liberou o desenho de imagens (canvas).');
  ctx.fillStyle = '#ffffff'; // fundo branco: PNG transparente vira papel, não preto
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: qualidade });
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), largura, altura };
}

async function lerFoto(arquivo: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(arquivo); // já aplica a orientação gravada pela câmera (EXIF)
  } catch {
    throw new ErroAmigavel(`Não consegui ler a imagem "${arquivo.name}". Use JPG, PNG ou WebP.`);
  }
}

async function imagensParaPdf(arquivos: File[], aoProgresso: AoProgresso): Promise<Uint8Array> {
  const jpegs: Jpeg[] = [];
  for (const [i, arquivo] of arquivos.entries()) {
    aoProgresso(i / arquivos.length, `Imagem ${i + 1} de ${arquivos.length}`);
    jpegs.push(await desenharJpeg(await lerFoto(arquivo), LADO_FOTO, 0.9));
  }
  aoProgresso(0.95, 'Montando o PDF');
  return montarPdfDeImagens(jpegs);
}

/** Refaz uma foto do PDF. null = fica como está (o navegador não a reabre igual, ex.: JPEG com giro gravado). */
function recodificador(nivel: NivelCompressao) {
  const { lado, qualidade } = COMPRESSAO[nivel];
  return async (jpeg: Uint8Array, largura: number, altura: number): Promise<Jpeg | null> => {
    const bitmap = await createImageBitmap(new Blob([jpeg as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })).catch(() => null);
    if (!bitmap) return null;
    if (bitmap.width !== largura || bitmap.height !== altura) {
      bitmap.close();
      return null;
    }
    return desenharJpeg(bitmap, lado, qualidade);
  };
}

/** Codifica a página desenhada pela tela principal (lá, com a aba escondida, cada codificação demora ~1 s). */
async function codificarImagem(imagem: ImageBitmap, formato: 'image/jpeg' | 'image/png'): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(imagem.width, imagem.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ErroAmigavel('O navegador não liberou o desenho de imagens (canvas).');
  ctx.drawImage(imagem, 0, 0);
  imagem.close();
  const blob = await canvas.convertToBlob({ type: formato, quality: 0.92 });
  return new Uint8Array(await blob.arrayBuffer());
}

type Resposta = { bytes: Uint8Array; info?: string };
type De<T extends PedidoEdicao['tipo']> = Extract<PedidoEdicao, { tipo: T }>;
type Edicoes = { [T in PedidoEdicao['tipo']]: (p: De<T>, aoProgresso: AoProgresso) => Promise<Resposta> };

async function ajustar(p: De<'a4'>): Promise<Resposta> {
  const r = await ajustarParaA4(p.bytes);
  return { bytes: r.bytes, info: `${r.ajustadas} de ${r.total} ${r.total === 1 ? 'página ajustada' : 'páginas ajustadas'}` };
}

async function comprimir(p: De<'comprimir'>, aoProgresso: AoProgresso): Promise<Resposta> {
  const r = await comprimirImagens(p.bytes, recodificador(p.nivel), aoProgresso);
  const info = r.total === 0 ? 'sem fotos para reduzir; o ganho vem da reorganização do arquivo' : `${r.trocadas} de ${r.total} ${r.total === 1 ? 'foto refeita' : 'fotos refeitas'}`;
  return { bytes: r.bytes, info };
}

const EDICOES: Edicoes = {
  codificar: async (p) => ({ bytes: await codificarImagem(p.imagem, p.formato) }),
  girar: async (p) => ({ bytes: await girarPaginas(p.bytes, p.giros) }),
  numerar: async (p) => ({ bytes: await numerarPaginas(p.bytes, p.opcoes) }),
  marcaDagua: async (p) => ({ bytes: await aplicarMarcaDagua(p.bytes, p.opcoes) }),
  carimbar: async (p) => ({ bytes: await carimbarTexto(p.bytes, p.opcoes) }),
  metadados: async (p) => ({ bytes: await limparMetadados(p.bytes) }),
  a4: ajustar,
  imagens: async (p, aoProgresso) => ({ bytes: await imagensParaPdf(p.arquivos, aoProgresso) }),
  comprimir,
};

function executar(pedido: PedidoEdicao, aoProgresso: AoProgresso): Promise<Resposta> {
  const editar = EDICOES[pedido.tipo] as (p: PedidoEdicao, a: AoProgresso) => Promise<Resposta>;
  return editar(pedido, aoProgresso);
}

escopo.onmessage = async ({ data: { id, pedido } }) => {
  try {
    const r = await executar(pedido, (progresso, etapa) => escopo.postMessage({ id, progresso, etapa }));
    escopo.postMessage({ id, ...r }, [r.bytes.buffer as ArrayBuffer]);
  } catch (e) {
    const texto = e instanceof ErroAmigavel ? e.message : `Não foi possível editar o PDF (${e instanceof Error ? e.message : 'erro desconhecido'}).`;
    escopo.postMessage({ id, erro: texto });
  }
};
