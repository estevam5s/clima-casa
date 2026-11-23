import { Redirect } from 'expo-router';
import { useClima } from '@/lib/contexto';

// O app abre em "/". Sem esta tela, "/" não existia (a primeira aba é /inicio) e o Android mostrava
// "rota não encontrada" logo ao abrir. Aqui ele só encaminha: para o Início com sessão, para o login sem.
export default function Entrada() {
  const { sessao, precisa2fa } = useClima();
  return <Redirect href={sessao && !precisa2fa ? '/inicio' : '/login'} />;
}
