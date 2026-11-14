// Endereço do site institucional (Next.js em ar-controle/site). Usado pelo botão "Voltar ao site".
export const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://zynio.com.br'
// O site está em outro domínio e não enxerga a sessão do sistema; o link avisa (o site mostra "LOGIN" ou "ENTRAR NO SISTEMA").
export const siteComSessao = (logado) => `${SITE_URL}/?sessao=${logado ? 1 : 0}`
