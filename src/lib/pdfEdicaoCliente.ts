// Ponte entre a tela e o Web Worker de edição (src/lib/pdfEdicao.worker.ts). Um worker só, criado no primeiro uso
// e encerrado ao cancelar: a memória com os arquivos vai junto.
import { novoWorker } from '@/lib/embutidos';
import type { MensagemWorker, PedidoEdicao } from '@/lib/pdfEdicao';

type Resposta = { bytes: Uint8Array; info?: string };
type Pendente = { resolver: (r: Resposta) => void; rejeitar: (e: Error) => void; aoProgresso: (fracao: number, etapa: string) => void };

let worker: Worker | null = null;
let proximoId = 1;
const pendentes = new Map<number, Pendente>();

function aoReceber({ data: m }: MessageEvent<MensagemWorker>) {
  const pendente = pendentes.get(m.id);
  if (!pendente) return;
  if ('progresso' in m) {
    pendente.aoProgresso(m.progresso, m.etapa);
    return;
  }
  pendentes.delete(m.id);
  if ('erro' in m) pendente.rejeitar(new Error(m.erro));
  else pendente.resolver(m);
}

/** Encerra o worker e recusa o que estava pendente (com o motivo, para aparecer na fila). */
export function encerrarEdicao(motivo = 'O processamento foi interrompido.') {
  worker?.terminate();
  worker = null;
  for (const p of pendentes.values()) p.rejeitar(new Error(motivo));
  pendentes.clear();
}

function obterWorker(): Worker {
  if (worker) return worker;
  worker = novoWorker('edicao');
  worker.onmessage = aoReceber;
  worker.onerror = (e) => {
    e.preventDefault();
    encerrarEdicao('O processamento do PDF parou de forma inesperada (memória do navegador ou arquivo muito grande).');
  };
  worker.onmessageerror = () => encerrarEdicao('O navegador não conseguiu passar o arquivo para o processamento.');
  return worker;
}

function transferiveis(pedido: PedidoEdicao): Transferable[] {
  if ('bytes' in pedido) return [pedido.bytes.buffer as ArrayBuffer];
  if ('paginas' in pedido) return pedido.paginas.map((p) => p.jpeg.buffer as ArrayBuffer);
  return 'imagem' in pedido ? [pedido.imagem] : [];
}

/** Os bytes e imagens enviados são transferidos (somem daqui): quem chama não deve mais usá-los. */
export function editarNoWorker(pedido: PedidoEdicao, aoProgresso: Pendente['aoProgresso']): Promise<Resposta> {
  const transferir = transferiveis(pedido);
  return new Promise((resolver, rejeitar) => {
    const id = proximoId++;
    pendentes.set(id, { resolver, rejeitar, aoProgresso });
    obterWorker().postMessage({ id, pedido }, transferir);
  });
}
