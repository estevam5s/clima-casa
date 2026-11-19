// Texto depois de mandar um e-mail: para Outlook/Hotmail avisa que a Microsoft costuma segurar (ou mandar para o lixo
// eletrônico) e-mails de domínios novos; em todos, diz onde acompanhar a entrega.
const MICROSOFT = /@(outlook|hotmail|live|msn)\.(com|com\.br)$/i
export function avisoEmail(para = [], prefixo = 'Enviado para') {
  const lista = [].concat(para || [])
  const ms = lista.some((e) => MICROSOFT.test(e))
  return `${prefixo} ${lista.join(', ')}.` + (ms ? ' Outlook/Hotmail pode atrasar algumas horas ou mandar para o Lixo Eletrônico: confira lá e marque "Não é lixo".' : '') + ' A entrega aparece em E-mails → Histórico.'
}
