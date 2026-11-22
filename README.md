# Manipulador de PDF

Junte, divida, organize, comprima, converta e numere PDFs no seu próprio aparelho. São 16 ferramentas num arquivo HTML só, sem cadastro e sem instalar nada. Os seus PDFs não são enviados a servidor.

- **Usar no navegador:** https://rafaelandreaadv-ui.github.io/manipulador-pdf/
- **Baixar para usar sem internet:** https://github.com/rafaelandreaadv-ui/manipulador-pdf/releases/latest/download/manipulador-de-pdf.html

Baixou, dois cliques, usou. Se o arquivo abrir em outro programa, use "Abrir com" e escolha o navegador.

## Avisos

- O PDF editado é um arquivo novo: assinatura digital (ICP-Brasil) do original não vale nele. Para protocolar documento assinado, use o original ou assine de novo.
- PDF em texto não faz OCR.
- Confira o resultado antes de protocolar.
- Testado em Chrome e Edge no Windows. Safari, Firefox, Mac e celulares ainda não foram testados.
- Fornecido como está, sem garantia.

## Privacidade

O próprio HTML traz uma política de segurança (CSP) que bloqueia chamadas de rede. O processamento acontece na memória do navegador. Na versão online, o GitHub Pages só entrega a página.

## Licença

Uso livre, inclusive no escritório, e o código pode ser copiado e modificado. **Não pode ser vendido**, nem oferecido como produto ou serviço pago cujo valor venha substancialmente dele: MIT com a condição Commons Clause (veja `LICENSE`). Não é uma licença "open source" na definição da OSI. Componentes de terceiros seguem as próprias licenças (`LICENCAS-TERCEIROS.txt`).

## Montar

`node montar.mjs <pasta node_modules>`, com `rolldown`, `pdf-lib@1.17.1`, `pdfjs-dist@6.4.299`, `lucide-react` e `@fontsource-variable/geist` instalados. Endereços e nome ficam em `config.json`.

© 2026 Rafael Andrea
