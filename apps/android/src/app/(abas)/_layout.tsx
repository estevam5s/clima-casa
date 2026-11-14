import { NativeTabs } from 'expo-router/native-tabs';
import { useTema } from '@/lib/tema';

export default function Abas() {
  const t = useTema();
  return (
    <NativeTabs backgroundColor={t.cartao} indicatorColor={t.muted} labelStyle={{ selected: { color: t.primaria } }} tintColor={t.primaria}>
      <NativeTabs.Trigger name="inicio">
        <NativeTabs.Trigger.Label>Início</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="square.grid.2x2" md="dashboard" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="aparelhos">
        <NativeTabs.Trigger.Label>Aparelhos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="snowflake" md="ac_unit" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cenas">
        <NativeTabs.Trigger.Label>Cenas</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sparkles" md="auto_awesome" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="mais">
        <NativeTabs.Trigger.Label>Mais</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="ellipsis.circle" md="more_horiz" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
