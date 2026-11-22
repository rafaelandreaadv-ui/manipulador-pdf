// Aparência: paleta + claro, escuro ou igual ao sistema. Troca só variáveis de cor; nada recarrega.
const GUARDA = 'manipulador-pdf:aparencia';
const sistemaEscuro = matchMedia('(prefers-color-scheme: dark)');
const aparencia = { paleta: PADRAO, modo: 'escuro' };

// file:// pode bloquear o localStorage (Safari, modo privado): a escolha vale até fechar a aba
let memoria = null, salvaNoNavegador = true;
try { memoria = localStorage.getItem(GUARDA); } catch { salvaNoNavegador = false; }
try {
  const lida = JSON.parse(memoria);
  if (PALETAS.some(([id]) => id === lida?.paleta)) aparencia.paleta = lida.paleta;
  if (['claro', 'escuro', 'sistema'].includes(lida?.modo)) aparencia.modo = lida.modo;
} catch { /* valor estragado: fica o padrão */ }

const modoReal = () => (aparencia.modo === 'sistema' ? (sistemaEscuro.matches ? 'escuro' : 'claro') : aparencia.modo);

function aplicarAparencia(guardar) {
  const h = document.documentElement;
  h.dataset.paleta = aparencia.paleta;
  h.dataset.tema = modoReal();
  if (guardar) {
    try { localStorage.setItem(GUARDA, JSON.stringify(aparencia)); salvaNoNavegador = true; } catch { salvaNoNavegador = false; }
  }
  document.querySelectorAll('[data-paleta-escolha]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.paletaEscolha === aparencia.paleta));
  document.querySelectorAll('[data-modo-escolha]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.modoEscolha === aparencia.modo));
  const tema = document.querySelector('#tema');
  if (tema) tema.innerHTML = i(h.dataset.tema === 'claro' ? 'moon' : 'sun');
  const aviso = document.querySelector('#aparencia-salva');
  if (aviso) aviso.textContent = salvaNoNavegador ? 'A escolha fica salva neste navegador.' : 'Este navegador não deixou salvar. A escolha vale até fechar a aba.';
  mudouPaleta();
}

const botaoAparencia = () => `<button class="abre-aparencia" id="abre-aparencia" popovertarget="aparencia" aria-label="Escolher cores e aparência"><span class="tres-cores" aria-hidden="true"><i></i><i></i><i></i></span><span>Cores</span></button>`;

function montarAparencia() {
  const amostra = (id, modo) => `<span class="amostra" data-paleta="${id}" data-tema="${modo}"><b>Aa<i class="ponta"></i></b><u></u></span>`;
  const painel = document.querySelector('#aparencia');
  painel.innerHTML = `<header><h2>Do seu jeito</h2><button class="redondo" popovertarget="aparencia" popovertargetaction="hide" aria-label="Fechar">${i('x')}</button></header>
    <div class="modos" role="group" aria-label="Claro ou escuro">${[['claro', 'sun', 'Claro'], ['escuro', 'moon', 'Escuro'], ['sistema', 'monitor', 'Sistema']].map(([m, icone, nome]) => `<button data-modo-escolha="${m}">${i(icone)}${nome}</button>`).join('')}</div>
    <div class="paletas" role="group" aria-label="Cores">${PALETAS.map(([id, nome]) => `<button data-paleta-escolha="${id}"><span class="par" aria-hidden="true">${amostra(id, 'claro')}${amostra(id, 'escuro')}</span><span class="nome-paleta">${nome}</span></button>`).join('')}</div>
    <p id="aparencia-salva"></p>`;
  painel.addEventListener('click', (e) => {
    const b = e.target.closest('button'), d = b?.dataset;
    if (d?.paletaEscolha) aparencia.paleta = d.paletaEscolha;
    else if (d?.modoEscolha) aparencia.modo = d.modoEscolha;
    else return;
    aplicarAparencia(true);
  });
  sistemaEscuro.addEventListener('change', () => aplicarAparencia(false));
  aplicarAparencia(false);
}
