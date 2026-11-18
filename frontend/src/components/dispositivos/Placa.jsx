import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Cpu, Download, KeyRound, RefreshCw, Wifi, Zap } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { Aviso, Botao, Selo, useToast } from '../ui'
import { ISRG_ROOT_X1 } from './isrgRootX1'

// Placa própria (Arduino / ESP) no lugar de um aparelho Smart Life. A placa BUSCA os comandos no servidor a cada 3 s
// (sai pela internet do escritório, não abre porta nenhuma), manda o estado e confirma o que fez. Token próprio por
// aparelho (aparece uma vez; gerar de novo invalida o anterior). Este arquivo gera o código completo da placa.
const SERVIDOR = 'app.zynio.com.br'
export const PLACAS = [
  { id: 'uno_r4_wifi', nome: 'Arduino UNO R4 WiFi', fam: 'arduino', inc: '#include <WiFiS3.h>', pino: '7', nota: 'Módulo Wi-Fi ESP32-S3 com raízes de certificado embutidas. Atualize o firmware do módulo pelo Arduino IDE se a conexão HTTPS falhar.' },
  { id: 'giga_r1_wifi', nome: 'Arduino GIGA R1 WiFi', fam: 'arduino', inc: '#include <WiFi.h>', pino: '7', nota: 'Pacote “Arduino Mbed OS GIGA Boards”. Pinos de 3,3 V: use módulo de relé que aceite 3,3 V no sinal.' },
  { id: 'opta_wifi', nome: 'Arduino Opta WiFi', fam: 'arduino', inc: '#include <WiFi.h>', pino: 'D0', ativo: 'HIGH', nota: 'Já tem 4 relés de 10 A (D0 a D3): não precisa de módulo de relé. Montagem em trilho DIN, feita por eletricista.' },
  { id: 'portenta_h7', nome: 'Arduino Portenta H7', fam: 'arduino', inc: '#include <WiFi.h>', pino: 'D7', nota: 'Pacote “Arduino Mbed OS Portenta Boards”. Use um módulo de relé com sinal de 3,3 V.' },
  { id: 'nano_33_iot', nome: 'Arduino Nano 33 IoT', fam: 'arduino', inc: '#include <WiFiNINA.h>', pino: '7', nota: 'Atualize o firmware do NINA (Ferramentas → WiFi101/WiFiNINA Firmware Updater) para ter as raízes de certificado atuais.' },
  { id: 'mkr_wifi_1010', nome: 'Arduino MKR WiFi 1010', fam: 'arduino', inc: '#include <WiFiNINA.h>', pino: '5', nota: 'Combina com o MKR Relay Proto Shield. Atualize o firmware do NINA se a conexão HTTPS falhar.' },
  { id: 'nano_esp32', nome: 'Arduino Nano ESP32', fam: 'esp32', pino: 'D7', nota: 'Pacote “Arduino ESP32 Boards”. Sinal de 3,3 V.' },
  { id: 'esp32', nome: 'ESP32 (DevKit)', fam: 'esp32', pino: '26', nota: 'Pacote “esp32” (Espressif). GPIO 26 → relé. Sinal de 3,3 V.' },
  { id: 'esp8266', nome: 'ESP8266 (NodeMCU / Wemos D1)', fam: 'esp8266', pino: 'D1', nota: 'Pacote “esp8266”. Pouca memória: o certificado é conferido com BearSSL e a hora vem da internet (NTP).' },
]

// ---------- lógica de cada aparelho (igual para todas as placas) ----------
function logica(tipo, p) {
  const ativo = p.ativo || 'HIGH'
  if (tipo === 'persiana') return `
// Persiana com motor de 2 sentidos e 2 relés (SUBIR e DESCER, nunca os dois juntos). A posição vem do tempo de curso.
const int PINO_SUBIR = ${p.pino};          // relé 1
const int PINO_DESCER = ${p.fam === 'esp32' ? '27' : p.fam === 'esp8266' ? 'D2' : p.pino === 'D0' ? 'D1' : '8'};         // relé 2
const int RELE_ATIVO = ${ativo};
const unsigned long CURSO_MS = 25000;      // tempo para ir de fechada a aberta: meça e ajuste
int posicao = 0;                            // 0 = fechada, 100 = aberta
int alvo = 0; int sentido = 0; unsigned long ultimoPasso = 0;
void motor(int s) { sentido = s; digitalWrite(PINO_SUBIR, s > 0 ? RELE_ATIVO : !RELE_ATIVO); digitalWrite(PINO_DESCER, s < 0 ? RELE_ATIVO : !RELE_ATIVO); ultimoPasso = millis(); }
void configurarAparelho() { pinMode(PINO_SUBIR, OUTPUT); pinMode(PINO_DESCER, OUTPUT); motor(0); }
void preencherEstado(JsonObject e) { e["posicao"] = posicao; e["movimento"] = sentido > 0 ? "subindo" : sentido < 0 ? "descendo" : "parada"; }
void executar(const char* acao, int valor) {
  if (!strcmp(acao, "abrir")) alvo = 100; else if (!strcmp(acao, "fechar")) alvo = 0;
  else if (!strcmp(acao, "posicao") && valor >= 0) alvo = constrain(valor, 0, 100);
  else if (!strcmp(acao, "parar")) { alvo = posicao; motor(0); return; }
  motor(alvo > posicao ? 1 : alvo < posicao ? -1 : 0);
}
void cuidarDoAparelho() {
  if (!sentido) return;
  unsigned long passo = CURSO_MS / 100;
  if (millis() - ultimoPasso >= passo) { ultimoPasso += passo; posicao = constrain(posicao + sentido, 0, 100); if ((sentido > 0 && posicao >= alvo) || (sentido < 0 && posicao <= alvo)) motor(0); }
}`
  if (tipo === 'fechadura') return `
// Fechadura: relé aciona o fecho elétrico (pulso) e um sensor magnético (reed) diz se a porta está aberta.
// Fecho elétrico comum: destrancar = pulso de PULSO_MS. Eletroímã (fica trancado energizado): mude TIPO_ELETROIMA para true.
const int PINO_FECHO = ${p.pino};
const int PINO_SENSOR = ${p.fam === 'esp32' ? '25' : p.fam === 'esp8266' ? 'D5' : '2'};   // reed switch entre o pino e o GND
const int RELE_ATIVO = ${ativo};
const bool TIPO_ELETROIMA = false;
const unsigned long PULSO_MS = 3000;
bool trancada = true; unsigned long abriuEm = 0;
void trancar(bool t) { trancada = t; bool energiza = TIPO_ELETROIMA ? t : !t; digitalWrite(PINO_FECHO, energiza ? RELE_ATIVO : !RELE_ATIVO); if (!t) abriuEm = millis(); }
void configurarAparelho() { pinMode(PINO_FECHO, OUTPUT); pinMode(PINO_SENSOR, INPUT_PULLUP); trancar(true); }
void preencherEstado(JsonObject e) { e["trancada"] = trancada; e["porta_aberta"] = digitalRead(PINO_SENSOR) == HIGH; }
void executar(const char* acao, int) { if (!strcmp(acao, "destrancar")) trancar(false); else if (!strcmp(acao, "trancar")) trancar(true); }
void cuidarDoAparelho() { if (!TIPO_ELETROIMA && !trancada && millis() - abriuEm > PULSO_MS) trancar(true); }   // o fecho só abre durante o pulso`
  return `
// Cafeteira: um relé liga e desliga a energia da máquina. Segurança local: desliga sozinha depois de DESLIGAR_APOS_MS,
// mesmo sem internet.
const int PINO_RELE = ${p.pino};
const int RELE_ATIVO = ${ativo};             // módulo de relé acionado em LOW? troque para LOW
const unsigned long DESLIGAR_APOS_MS = 45UL * 60 * 1000;
bool ligada = false; unsigned long ligouEm = 0;
void ligar(bool on) { ligada = on; digitalWrite(PINO_RELE, on ? RELE_ATIVO : !RELE_ATIVO); if (on) ligouEm = millis(); }
void configurarAparelho() { pinMode(PINO_RELE, OUTPUT); ligar(false); }
void preencherEstado(JsonObject e) { e["ligada"] = ligada; }
void executar(const char* acao, int) { if (!strcmp(acao, "ligar")) ligar(true); else if (!strcmp(acao, "desligar")) ligar(false); }
void cuidarDoAparelho() { if (ligada && millis() - ligouEm > DESLIGAR_APOS_MS) ligar(false); }`
}

// ---------- rede e conversa com o servidor (por família de placa) ----------
function rede(p) {
  const corpoJson = `
String montarCorpo() {
  JsonDocument doc;
  doc["placa"] = "${p.id}"; doc["firmware"] = FIRMWARE; doc["rssi"] = WiFi.RSSI(); doc["uptime_s"] = millis() / 1000;
  preencherEstado(doc["estado"].to<JsonObject>());
  JsonArray f = doc["feitos"].to<JsonArray>();
  for (int i = 0; i < nFeitos; i++) f.add(feitos[i]);
  String s; serializeJson(doc, s); return s;
}
void tratarResposta(const String& r) {
  nFeitos = 0;
  JsonDocument doc;
  if (deserializeJson(doc, r)) return;
  for (JsonObject c : doc["comandos"].as<JsonArray>()) {
    executar(c["acao"] | "", c["valor"] | -1);
    if (nFeitos < 20) feitos[nFeitos++] = String((const char*)(c["id"] | ""));
  }
}`
  if (p.fam === 'arduino') return `${p.inc}
#include <ArduinoHttpClient.h>   // Biblioteca: ArduinoHttpClient
#include <ArduinoJson.h>         // Biblioteca: ArduinoJson (v7)
WiFiSSLClient tls;               // HTTPS: o módulo Wi-Fi confere o certificado
HttpClient http(tls, SERVIDOR, 443);
String feitos[20]; int nFeitos = 0;
${corpoJson}
void conectarWiFi() {
  while (WiFi.status() != WL_CONNECTED) { WiFi.begin(WIFI_NOME, WIFI_SENHA); delay(5000); }
}
void sincronizar() {
  String corpo = montarCorpo();
  http.beginRequest();
  http.post("/api/iot/sincronizar");
  http.sendHeader("Content-Type", "application/json");
  http.sendHeader("Authorization", String("Bearer ") + TOKEN);
  http.sendHeader("Content-Length", corpo.length());
  http.beginBody(); http.print(corpo); http.endRequest();
  int st = http.responseStatusCode(); String r = http.responseBody(); http.stop();
  if (st == 200) tratarResposta(r);
}`
  if (p.fam === 'esp32') return `#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>         // Biblioteca: ArduinoJson (v7)
const char* RAIZ_CA = R"PEM(
${ISRG_ROOT_X1}
)PEM";
WiFiClientSecure tls;
String feitos[20]; int nFeitos = 0;
${corpoJson}
void conectarWiFi() {
  WiFi.mode(WIFI_STA); WiFi.begin(WIFI_NOME, WIFI_SENHA);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  tls.setCACert(RAIZ_CA);
}
void sincronizar() {
  HTTPClient http;
  http.begin(tls, String("https://") + SERVIDOR + "/api/iot/sincronizar");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + TOKEN);
  int st = http.POST(montarCorpo());
  if (st == 200) tratarResposta(http.getString());
  http.end();
}`
  return `#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <time.h>
#include <ArduinoJson.h>         // Biblioteca: ArduinoJson (v7)
const char RAIZ_CA[] PROGMEM = R"PEM(
${ISRG_ROOT_X1}
)PEM";
BearSSL::X509List raiz(RAIZ_CA);
BearSSL::WiFiClientSecure tls;
String feitos[20]; int nFeitos = 0;
${corpoJson}
void conectarWiFi() {
  WiFi.mode(WIFI_STA); WiFi.begin(WIFI_NOME, WIFI_SENHA);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  configTime(0, 0, "pool.ntp.org", "time.google.com");   // o certificado só confere com a hora certa
  while (time(nullptr) < 1700000000) delay(300);
  tls.setTrustAnchors(&raiz); tls.setBufferSizes(4096, 1024);
}
void sincronizar() {
  HTTPClient http;
  http.begin(tls, String("https://") + SERVIDOR + "/api/iot/sincronizar");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + TOKEN);
  int st = http.POST(montarCorpo());
  if (st == 200) tratarResposta(http.getString());
  http.end();
}`
}

export function gerarCodigo(tipo, placaId, token, nome) {
  const p = PLACAS.find((x) => x.id === placaId) || PLACAS[0]
  return `// Clima Escritório · ${nome} · ${p.nome}
// Gerado pelo painel. Preencha o nome e a senha do Wi-Fi do escritório (2,4 GHz) e envie para a placa pelo Arduino IDE.
// O TOKEN identifica este aparelho: não publique este arquivo. Gerar um código novo no painel invalida este.
const char* WIFI_NOME  = "NOME_DA_REDE_WIFI";
const char* WIFI_SENHA = "SENHA_DO_WIFI";
const char* SERVIDOR   = "${SERVIDOR}";
const char* TOKEN      = "${token || 'GERE_O_TOKEN_NO_PAINEL'}";
const char* FIRMWARE   = "clima-placa 1.0";
const unsigned long INTERVALO_MS = 3000;   // o servidor espera ~3 s entre as sincronizações
${rede(p)}
${logica(tipo, p)}

unsigned long ultimaSinc = 0;
void setup() {
  Serial.begin(115200);
  configurarAparelho();
  conectarWiFi();
}
void loop() {
  if (WiFi.status() != WL_CONNECTED) conectarWiFi();
  cuidarDoAparelho();
  if (millis() - ultimaSinc >= INTERVALO_MS) { ultimaSinc = millis(); sincronizar(); }
}
`
}

const LIGACAO = {
  cafeteira: ['Módulo de relé de 1 canal (10 A / 250 V) ou relé de estado sólido (SSR) para a tomada da cafeteira.', 'Sinal do relé no pino indicado, GND no GND e VCC no 5 V (ou 3,3 V, conforme o módulo).', 'A fase da tomada passa pelo COM e NA (normalmente aberto) do relé. Instalação em 127/220 V: com eletricista, numa caixa fechada.'],
  persiana: ['Motor de persiana de 2 sentidos (subir/descer) e 2 relés com intertravamento: nunca os dois ligados.', 'Relé 1 = subir, relé 2 = descer, nos pinos indicados. Meça o tempo de fechada a aberta e ajuste CURSO_MS.', 'Motor em 127/220 V: instalação por eletricista.'],
  fechadura: ['Fecho elétrico (12 V, abre com pulso) ou eletroímã (trancado enquanto energizado) com fonte própria.', 'Relé no pino indicado; sensor magnético (reed) da porta entre o pino do sensor e o GND.', 'Eletroímã: deixe TIPO_ELETROIMA = true e garanta saída de emergência (botoeira) conforme a norma.'],
}

export default function Placa({ d, aoMudar }) {
  const toast = useToast()
  const [placa, setPlaca] = useState(d.placa || 'esp32')
  const [token, setToken] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const p = PLACAS.find((x) => x.id === placa) || PLACAS[0]
  const codigo = useMemo(() => gerarCodigo(d.tipo, placa, token, d.nome), [d.tipo, placa, token, d.nome])
  const gerar = async () => {
    if (d.placa_configurada && !window.confirm('Gerar um token novo desliga a placa que já está usando o token atual (até você enviar o código novo para ela). Continuar?')) return
    setOcupado(true)
    try { const r = await api.post(`/api/dispositivos/${d.id}/placa`, { placa }); setToken(r.token); aoMudar?.(r.dispositivo); toast('Token gerado: copie o código agora (ele não aparece de novo).') }
    catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  const copiar = async () => { try { await navigator.clipboard.writeText(codigo); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { toast('Não deu para copiar: selecione o texto.', 'erro') } }
  const baixar = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([codigo], { type: 'text/plain' })); a.download = `clima_${d.tipo}_${placa}.ino`; a.click(); URL.revokeObjectURL(a.href) }
  const info = d.info_placa || {}
  useEffect(() => { if (d.placa) setPlaca(d.placa) }, [d.placa])
  return (
    <div className="space-y-4">
      {d.driver === 'placa' && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 text-sm">
          <Cpu className="h-4 w-4 text-muted-foreground" /><b>{PLACAS.find((x) => x.id === d.placa)?.nome || d.placa}</b>
          {d.online ? <Selo cor="verde">Online</Selo> : d.conectado ? <Selo cor="ambar">Sem contato</Selo> : <Selo>Esperando a 1ª conexão</Selo>}
          {d.visto_em && <span className="text-xs text-muted-foreground">último contato {haQuanto(d.visto_em)}</span>}
          {info.rssi != null && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Wifi className="h-3.5 w-3.5" />{info.rssi} dBm</span>}
          {info.firmware && <span className="text-xs text-muted-foreground">{info.firmware}</span>}
          {d.fila?.length > 0 && <span className="text-xs text-amber-700 dark:text-amber-400">{d.fila.length} comando(s) esperando a placa</span>}
        </div>
      )}
      <div>
        <p className="rotulo">Placa</p>
        <div className="grid gap-1.5 sm:grid-cols-3">{PLACAS.map((x) => (
          <button key={x.id} type="button" onClick={() => setPlaca(x.id)} aria-pressed={placa === x.id} className={`rounded-md border px-2.5 py-2 text-left text-xs ${placa === x.id ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted'}`}>{x.nome}</button>))}
        </div>
        <p className="ajuda mt-1">{p.nota}</p>
      </div>
      <div className="rounded-md border border-border p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium"><Zap className="h-4 w-4 text-muted-foreground" />Ligação</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">{LIGACAO[d.tipo].map((t) => <li key={t}>{t}</li>)}</ol>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Botao icone={KeyRound} carregando={ocupado} onClick={gerar}>{d.placa_configurada ? 'Gerar token novo' : 'Gerar token e código'}</Botao>
        {token && <span className="text-xs text-emerald-700 dark:text-emerald-400">Token no código abaixo: copie agora.</span>}
        {!token && d.placa_configurada && <span className="text-xs text-muted-foreground">O token atual não aparece de novo; o código abaixo sai sem ele.</span>}
      </div>
      <div className="relative">
        <pre className="max-h-80 overflow-auto rounded-md bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-100">{codigo}</pre>
        <div className="mt-2 flex flex-wrap gap-2">
          <Botao tamanho="sm" variante="secundario" icone={copiado ? Check : Copy} onClick={copiar}>{copiado ? 'Copiado' : 'Copiar código'}</Botao>
          <Botao tamanho="sm" variante="secundario" icone={Download} onClick={baixar}>Baixar .ino</Botao>
          {d.driver === 'placa' && <Botao tamanho="sm" variante="fantasma" icone={RefreshCw} onClick={async () => { try { aoMudar?.(await api.post(`/api/dispositivos/${d.id}/tuya`)); toast('Voltou para aparelho Smart Life.') } catch (e) { toast(e.message, 'erro') } }}>Usar Smart Life em vez da placa</Botao>}
        </div>
      </div>
      <Aviso tipo="alerta">Bibliotecas no Arduino IDE: <b>ArduinoJson</b>{p.fam === 'arduino' ? <> e <b>ArduinoHttpClient</b></> : null}. Preencha o nome e a senha do Wi-Fi no código antes de enviar. A placa só conversa por HTTPS com {SERVIDOR}, conferindo o certificado.</Aviso>
    </div>
  )
}
