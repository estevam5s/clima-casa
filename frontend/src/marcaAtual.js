// Preferências da marca usadas por funções fora do React (formatação de temperatura e hora).
export const marcaAtual = { unidade: 'C', hora12: false, nome: 'Clima Escritório' }
export function temp(c) { return marcaAtual.unidade === 'F' ? Math.round(c * 9 / 5 + 32) : c }
export const simboloTemp = () => (marcaAtual.unidade === 'F' ? '°F' : '°C')
