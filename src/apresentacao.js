// Apresentação cinematográfica e "Como baixar" da v3.
/*! Raios (shader) e revelação com desfoque portados de Spell UI (Light Rays e Blur Reveal), https://github.com/xxtomm/spell-ui
MIT License. Copyright (c) 2025 Spell UI
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. */

const PONTA = '<span class="ponta" aria-hidden="true"></span>';

// Blur Reveal: letra a letra, 20 ms entre uma e outra; o leitor de tela recebe a frase inteira
function revelar(texto, destaque, atraso) {
  let n = 0;
  const palavras = `${texto} ${destaque}`.split(' '), inicioDestaque = texto.split(' ').length;
  return `<span class="sr">${texto} ${destaque}</span>${palavras.map((p, k) => `<span class="palavra ${k >= inicioDestaque ? 'forte' : ''}" aria-hidden="true">${[...p].map((c) => `<span class="letra" style="animation-delay:${atraso + n++ * 20}ms">${c}</span>`).join('')}</span>`).join(' ')}`;
}

function cena() {
  const linhas = (q) => Array.from({ length: q }, (_, k) => `<u style="--n:${k}"></u>`).join('');
  const doc = (classe, titulo) => `<div class="doc ${classe}"><div class="doc-face"><b>${titulo}</b>${linhas(13)}</div></div>`;
  return `<div class="cena" aria-hidden="true">
    <div class="chao"></div>
    ${doc('longe e2', 'Comprovante')}${doc('longe d2', 'Laudo')}${doc('lado e1', 'Procuração')}${doc('lado d1', 'Contrato')}
    <div class="doc heroi"><div class="doc-face"><b>Petição <em>inicial</em></b>${linhas(16)}<i class="varre"></i></div></div></div>`;
}

const luzes = (comPonta) => `<div class="luzes" aria-hidden="true"><canvas class="raios"></canvas><canvas class="facho"></canvas>${comPonta ? '<div class="fonte-luz"><i class="rastro"></i><i class="ponta"></i></div>' : ''}</div>`;

function cenaPasso(n, mac) {
  const arquivo = `<span class="arquivo"><span class="arq-ico">${i('file-text')}</span><b>${MARCA.arquivo}</b></span>`;
  const controles = mac ? '<span class="sem"><i></i><i></i><i></i></span>' : '<span class="win"><i></i><i></i><i></i></span>';
  const janela = (titulo, miolo) => `<div class="quadro-janela ${mac ? 'mac' : ''}"><div class="quadro-topo">${controles}<small>${titulo}</small></div><div class="quadro-miolo">${miolo}</div></div>`;
  if (n === 1) return `<div class="quadro q1" aria-hidden="true">${janela('Navegador', `<span class="falso-baixar">${i('download')}Baixar</span><span class="cai-arquivo">${arquivo}</span><span class="baixando"><i></i></span>`)}<i class="cursor"></i></div>`;
  if (n === 2) return `<div class="quadro q2" aria-hidden="true">${janela(mac ? 'Finder · arquivos baixados' : 'Explorador · Downloads', `<span class="selecao">${arquivo}</span><i class="clique"></i><i class="clique segundo"></i>`)}<i class="cursor"></i></div>`;
  return `<div class="quadro q3" aria-hidden="true">${janela(MARCA.nome, `<span class="app-mini">${[1, 2, 3, 4, 5, 6].map(() => '<u></u>').join('')}</span><span class="feito-mini">${i('check')}Pronto para usar</span>`)}</div>`;
}

function telaBaixar() {
  const mac = geral.sistema === 'mac';
  const passo = (n, titulo, texto) => `<li class="passo">${cenaPasso(n, mac)}<div class="passo-texto"><span class="num">${n}</span><div><h3>${titulo}</h3><p>${texto}</p></div></div></li>`;
  return `<div class="site">${luzes(false)}${fundo}${barra('baixar')}<main class="secao baixar">
    <div class="baixar-topo">
      <h1 class="titulo-site" tabindex="-1">Baixou. Dois cliques. <em>Usou.</em>${PONTA}</h1>
      <p class="lead">É um arquivo só. Não tem ZIP, instalador, cadastro nem senha.</p>
      <a class="btn-luz g mega" id="baixar-arquivo" href="${MARCA.baixar}" data-externo target="_blank" rel="noopener noreferrer">${i('download')}<span>Baixar o Manipulador (1 arquivo)</span></a>
      <div class="sistemas" role="group" aria-label="Seu computador"><button id="so-win" data-so="win" aria-pressed="${!mac}">Windows</button><button id="so-mac" data-so="mac" aria-pressed="${mac}">Mac</button></div>
    </div>
    <ol class="passos">
      ${passo(1, 'Baixou', 'Clique no botão. O arquivo vai para os seus downloads.')}
      ${passo(2, 'Dois cliques', mac ? 'Ache o arquivo no Finder e clique duas vezes.' : 'Ache o arquivo em Downloads e clique duas vezes.')}
      ${passo(3, 'Usou', 'Ele abre no navegador. Pode até desligar a internet.')}
    </ol>
    <section class="no-celular">
      <span class="cel-ico">${i('smartphone')}</span>
      <div><h2>Tá no celular ou só quer testar?</h2><p>Abre direto no navegador, sem baixar. Para ter no computador, mande o link para você.</p></div>
      <div class="cel-acoes"><a class="btn-vidro" id="usar-online" href="${MARCA.online}" data-externo target="_blank" rel="noopener noreferrer">${i('zap')}Usar no navegador</a>
        <button class="btn-vidro" id="copiar-link" data-copiar="link">${i('copy')}Me manda pro computador</button></div>
    </section>
    <details class="extra"><summary>Deu algum problema para abrir? ${i('chevron-down')}</summary>
      <p>Se abrir em outro programa, clique no arquivo com o botão direito, use <b>${mac ? 'Abrir Com' : 'Abrir com'}</b> e escolha o navegador. Se o navegador perguntar se quer manter o arquivo, confira se ele veio do endereço deste botão antes de aceitar.</p></details>
    <details class="extra" id="com-ia"><summary>Prefere pedir pra IA? <span>opcional</span>${i('chevron-down')}</summary>
      <p>Serve para IA que mexe no seu computador, como o Claude Code. Chat comum não salva arquivo na sua máquina.</p>
      <pre id="pedido-ia">${pedidoIA()}</pre>
      <button class="btn-vidro" id="copiar-pedido" data-copiar="pedido">${i('copy')}Copiar o pedido</button>
      <p class="cuidado">Não mande os seus PDFs para a IA. Ela só precisa baixar e abrir a ferramenta.</p>
      <p>Programa e prefere clonar?</p><pre>git clone ${MARCA.repo}.git</pre></details>
    ${ICP}</main>${rodapeSite()}</div>`;
}

const pedidoIA = () => `Baixe só este arquivo: ${MARCA.baixar}
Salve na minha Área de Trabalho como ${MARCA.arquivo} e abra no navegador.
Não use outro endereço e não leia nem envie meus documentos.`;

async function copiar(tipo) {
  const texto = tipo === 'link' ? MARCA.online : pedidoIA();
  try {
    await navigator.clipboard.writeText(texto);
    avisar(tipo === 'link' ? 'Link copiado. Cole no seu WhatsApp ou e-mail e abra no computador.' : 'Pedido copiado.');
  } catch {
    avisar(`Não consegui copiar. Copie daqui: ${texto}`);
  }
}

const VERTICE = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
// Fragmento do Spell UI Light Rays, sem three.js
const FRAGMENTO = `precision highp float;
uniform vec2 r, o1, o2; uniform float t; uniform vec3 c1, c2;
const float alcance = .08, intensidade = .065, v = .96;
float raio(vec2 o, vec2 dir, vec2 p, float a, float b, float s){
  vec2 d = p - o; float cosA = dot(normalize(d), dir), diag = length(r);
  return clamp((.45 + .15 * sin(cosA * a + t * s)) + (.3 + .2 * cos(-cosA * b + t * s)), alcance, 1.) * clamp((diag - length(d)) / diag, alcance, 1.);
}
void main(){
  vec2 p = vec2(gl_FragCoord.x, r.y - gl_FragCoord.y);
  float f1 = raio(o1, normalize(vec2(1., -.116)), p, 36.2214 * v, 21.11349 * v, 1.5 * v);
  float f2 = raio(o2, normalize(vec2(1., .241)), p, 22.3991 * v, 18.0234 * v, 1.1 * v);
  float at = clamp(alcance - p.y / r.y + .5 + intensidade, 0., 1.);
  float a1 = f1 * at, a2 = f2 * at, a = a1 + a2 * (1. - a1);
  vec3 cor = c1 * a1 + c2 * a2;
  gl_FragColor = vec4(min(cor, vec3(a)), a);
}`;

function ligarRaios(tela) {
  const gl = tela.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
  if (!gl) return null;
  const prog = gl.createProgram();
  for (const [tipo, fonte] of [[gl.VERTEX_SHADER, VERTICE], [gl.FRAGMENT_SHADER, FRAGMENTO]]) {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, fonte); gl.compileShader(s); gl.attachShader(prog, s);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const u = (nome) => gl.getUniformLocation(prog, nome), onde = { r: u('r'), o1: u('o1'), o2: u('o2'), t: u('t') };
  return {
    colorir(um, dois) {
      gl.uniform3f(u('c1'), ...um.map((v) => v / 255));
      gl.uniform3f(u('c2'), ...dois.map((v) => v / 255));
    },
    desenhar(t, origem) {
      // um terço da resolução: luz é macia e a máquina fraca agradece
      const w = Math.max(1, Math.round(tela.clientWidth / 3)), h = Math.max(1, Math.round(tela.clientHeight / 3));
      if (tela.width !== w || tela.height !== h) { tela.width = w; tela.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(onde.r, w, h);
      gl.uniform2f(onde.o1, origem * w, -0.4 * h);
      gl.uniform2f(onde.o2, (origem + 0.02) * w, -0.5 * h);
      gl.uniform1f(onde.t, 40 + t / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    soltar() { gl.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}

// do halo largo ao miolo do facho: muitas camadas fracas não fazem degrau
const CAMADAS_DE_LUZ = Array.from({ length: 22 }, (_, k) => [2.3 - k * 0.095, 0.03]);

let quadroCena = 0, raiosVivos = null, vigia = null, pintarJa = null;
let luz = { cor: [228, 175, 85], alto: [255, 243, 214], clara: false };

function mudouPaleta() {
  const css = getComputedStyle(document.documentElement), rgb = (nome) => css.getPropertyValue(`--${nome}-rgb`).trim().split(' ').map(Number);
  const clara = document.documentElement.dataset.tema === 'claro';
  luz = { clara, cor: clara ? [255, 255, 255] : rgb('acento'), alto: clara ? [255, 255, 255] : rgb('alto'), tinta: rgb('tinta-alta'), acento: rgb('acento') };
  raiosVivos?.colorir(luz.acento, luz.tinta);
  pintarJa?.();
}

// A ponta é a fonte da luz: facho e poeira saem dela e caem no documento.
function iniciarCena() {
  cancelAnimationFrame(quadroCena);
  raiosVivos?.soltar();
  raiosVivos = null; pintarJa = null;
  vigia?.disconnect();
  const caixa = raiz.querySelector('.luzes');
  if (!caixa) return;
  const tela = caixa.querySelector('.facho'), c = tela.getContext('2d');
  const fonte = caixa.querySelector('.fonte-luz'), alvo = raiz.querySelector('.doc.heroi');
  raiosVivos = ligarRaios(caixa.querySelector('.raios'));
  const po = Array.from({ length: 170 }, () => ({ u: Math.random(), v: Math.random(), r: 0.4 + Math.random() ** 3 * 2, s: 0.4 + Math.random(), f: Math.random() * 7 }));
  const grao = document.createElement('canvas');
  grao.width = grao.height = 32;
  const g = grao.getContext('2d');
  let luzDoGrao = null;
  const tingirGrao = () => {
    const ponto = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    ponto.addColorStop(0, `rgb(${luz.alto})`); ponto.addColorStop(0.35, `rgba(${luz.cor},.5)`); ponto.addColorStop(1, `rgba(${luz.cor},0)`);
    g.clearRect(0, 0, 32, 32); g.fillStyle = ponto; g.fillRect(0, 0, 32, 32);
    luzDoGrao = luz;
  };
  // o facho nasce em 1/6 do tamanho e é esticado: luz sem degrau, sem pontilhado e mais barata
  const miniFacho = document.createElement('canvas'), f = miniFacho.getContext('2d');
  let anterior = 0, passo = 0, lentos = 0, economico = false, mira = null;

  function pintar(t) {
    const w = tela.clientWidth, h = tela.clientHeight;
    if (!w || !h) return;
    if (tela.width !== w || tela.height !== h) { tela.width = w; tela.height = h; }
    let x = w * 0.5, y = -20;
    if (fonte) { x = fonte.offsetLeft + fonte.offsetWidth * 0.48; y = fonte.offsetTop + fonte.offsetHeight * 0.54; }
    // máquina fraca: os raios ficam parados e o facho leva menos camadas
    const leve = economico || w < 700;
    if (economico ? passo < 2 || parado.matches : passo % (leve ? 6 : 2) === 0) raiosVivos?.desenhar(t, x / w);
    c.clearRect(0, 0, w, h);
    if (luzDoGrao !== luz) tingirGrao();
    c.globalCompositeOperation = luz.clara ? 'source-over' : 'lighter';
    const ganho = luz.clara ? 4 : 1;
    const forca = Math.min(1, Math.max(0, (t - 750) / 1100));
    if (fonte && alvo && forca) {
      const base = alvo.closest('.hero').getBoundingClientRect(), palco = alvo.closest('.cena').getBoundingClientRect();
      const aceso = alvo.closest('.cena').querySelector('.doc:hover')?.getBoundingClientRect(); // o facho segue o documento sob o mouse
      const quer = (aceso ? aceso.left + aceso.width / 2 : palco.left + palco.width / 2) - base.left;
      mira = mira === null || parado.matches ? quer : mira + (quer - mira) * 0.14;
      const cx = mira, meia = alvo.offsetWidth * 0.64, pe = h;
      const mw = Math.ceil(w / 8), mh = Math.ceil(h / 8);
      if (miniFacho.width !== mw || miniFacho.height !== mh) { miniFacho.width = mw; miniFacho.height = mh; }
      f.setTransform(1, 0, 0, 1, 0, 0);
      f.globalCompositeOperation = 'source-over';
      f.clearRect(0, 0, mw, mh);
      f.setTransform(mw / w, 0, 0, mh / h, 0, 0);
      // camadas lisas e um degradê só por cima: degradê fraco repetido vira pontilhado
      f.globalCompositeOperation = 'lighter';
      f.fillStyle = `rgb(${luz.cor})`;
      for (const [abre, alfa] of CAMADAS_DE_LUZ) {
        f.globalAlpha = alfa * ganho * forca * (leve ? 0.7 : 1);
        f.beginPath(); f.moveTo(x - 3, y); f.lineTo(x + 3, y); f.lineTo(cx + meia * abre, pe); f.lineTo(cx - meia * abre, pe); f.closePath(); f.fill();
      }
      f.globalAlpha = 1;
      f.globalCompositeOperation = 'source-atop';
      const miolo = f.createLinearGradient(x, y, cx, pe);
      miolo.addColorStop(0, `rgba(${luz.alto},1)`);
      miolo.addColorStop(0.4, `rgba(${luz.alto},0)`);
      f.fillStyle = miolo; f.fillRect(0, 0, w, h);
      f.globalCompositeOperation = 'destination-in';
      const some = f.createLinearGradient(x, y, cx, pe);
      some.addColorStop(0, 'rgba(0,0,0,1)');
      some.addColorStop(1, 'rgba(0,0,0,.45)');
      f.fillStyle = some; f.fillRect(0, 0, w, h);
      c.drawImage(miniFacho, 0, 0, w, h);
      for (const p of po.slice(0, leve ? 45 : 150)) {
        const u = (p.u + t * 0.000025 * p.s) % 1, larg = u * meia * 1.5;
        const px = x + (cx - x) * u + (p.v * 2 - 1) * larg + Math.sin(t / 1700 + p.f) * 6, py = y + (pe - y) * u + Math.cos(t / 2100 + p.f) * 8;
        c.globalAlpha = forca * Math.sin(Math.PI * u) * (0.45 + 0.4 * Math.sin(t / 900 + p.f));
        c.drawImage(grao, px - p.r * 2.5, py - p.r * 2.5, p.r * 5, p.r * 5);
      }
    }
    for (const p of po.slice(150)) { // poeira perto da lente: grande e fora de foco
      const d = 12 + p.r * 20;
      c.globalAlpha = 0.13 * Math.min(1, t / 1500);
      c.drawImage(grao, ((p.u + t * 0.000009 * p.s) % 1) * w, p.v * h + Math.sin(t / 3000 + p.f) * 18, d, d);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  mudouPaleta();
  if (parado.matches) {
    const estatico = () => { passo = 0; if (caixa.isConnected) pintar(6000); };
    quadroCena = requestAnimationFrame(estatico);
    pintarJa = estatico;
    vigia = new ResizeObserver(estatico);
    vigia.observe(caixa);
    return;
  }
  const inicio = performance.now();
  const andar = (agora) => {
    quadroCena = requestAnimationFrame(andar);
    const dt = agora - anterior, visivel = scrollY < innerHeight * 1.3;
    if (!visivel || (economico && dt < 60) || (tela.clientWidth < 700 && dt < 30)) return;
    if (anterior && !economico) { lentos = dt > 50 ? lentos + 2 : Math.max(0, lentos - 1); economico = lentos > 30; }
    anterior = agora; passo++;
    pintar(agora - inicio);
  };
  quadroCena = requestAnimationFrame(andar);
}

document.addEventListener('click', (e) => {
  const externo = e.target.closest('[data-externo]');
  if (externo && !MARCA.publicado) { e.preventDefault(); avisar('Este endereço entra no ar quando o repositório for publicado.'); }
  const botao = e.target.closest('[data-copiar]');
  if (botao) copiar(botao.dataset.copiar);
});
