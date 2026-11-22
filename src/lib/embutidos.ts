// O que vem dentro do HTML, em blocos de dados: os dois workers, os CMaps e as fontes padrão.
let codigos: Record<'edicao' | 'leitor', string> | null = null;
let dados: Record<string, string> | null = null;
const enderecos = new Map<string, string>();

function bloco<T>(id: string): T {
  return JSON.parse(document.getElementById(id)!.textContent!) as T;
}

/** Worker clássico a partir de blob: funciona com o HTML aberto por file://. */
export function novoWorker(qual: 'edicao' | 'leitor'): Worker {
  if (!enderecos.has(qual)) {
    codigos ??= bloco<Record<'edicao' | 'leitor', string>>('workers');
    enderecos.set(qual, URL.createObjectURL(new Blob([codigos[qual]], { type: 'text/javascript' })));
  }
  return new Worker(enderecos.get(qual)!);
}

/** Fonte substituta do pdf.js vem como url(embutido/Nome.ttf): troca pela que está no HTML. */
export function srcEmbutido(src: string): string {
  return src.replace(/url\(embutido\/([\w-]+\.ttf)\)/g, (_, nome: string) => {
    arquivoEmbutido(nome); // confere que existe e carrega o bloco
    return `url(data:font/ttf;base64,${dados![nome]})`;
  });
}

export function arquivoEmbutido(nome: string): Uint8Array {
  dados ??= bloco<Record<string, string>>('dados');
  if (!Object.hasOwn(dados, nome)) throw new Error(`Arquivo de apoio ausente: ${nome}`);
  return Uint8Array.from(atob(dados[nome]), (c) => c.charCodeAt(0));
}
