# Rotas Bika+ — registo de visitas dos técnicos de rota

**Link da app:** https://aqi-mz.github.io/Bika/ (depois de ativar o GitHub Pages: Settings → Pages → Branch `main` / `(root)` → Save)

App web que se instala no telemóvel (Android/iPhone) e funciona **sem rede**.
O técnico regista a chegada ao cliente (nome, contacto, GPS, data e hora), vende, regista a saída.
Os registos ficam no telemóvel e são enviados sozinhos quando houver rede para um **Google Sheet**.

## O que a app faz

**Técnico**
- *Hoje*: objetivos da semana (visitas, novos clientes, sacos de ração, repetição de compra) com barra de progresso; visita em curso com cronómetro; botão “Registar saída”.
- *Nova visita*: ao escrever o nome, a app sugere os clientes da carteira do técnico e preenche o contacto; se o GPS estiver a mais de 300 m do local registado do cliente, avisa. Cliente novo / existente, nome, contacto, localidade, botão **Obter localização** (latitude, longitude, precisão, data e hora), sacos vendidos, notas, foto (fica carimbada com data, hora e coordenadas).
- *Histórico*: visitas por dia, duração, estado de envio.

**Supervisor** (PIN próprio)
- *Painel*: cumprimento de objetivos por técnico, tempo médio por visita, taxa de confirmação por chamada, alertas.
- *Visitas*: relatório filtrável por técnico e datas, link para cada ponto no Google Maps, percurso do dia, exportação CSV (abre no Excel).
- *Clientes*: carregar a listagem de clientes em Excel (.xlsx) ou CSV — colunas reconhecidas pelo nome do cabeçalho: **Nome**, **Contacto**, Localidade, Técnico, Latitude, Longitude (modo *Juntar/atualizar* pelo telefone, ou *Substituir tudo*); exportar os **novos clientes** angariados num período; ver clientes sem visita há mais de 14/30/60/90 dias, clientes que nunca foram visitados e clientes visitados que não estão na carteira.
- *Confirmar*: sorteio aleatório de N visitas para ligar ao cliente e registar “Confirmou / Não confirmou / Não atendeu”.
- *Objetivos*: metas semanais por técnico (os técnicos recebem-nas na sincronização seguinte).

**Alertas automáticos**: visita com menos de 5 min · sem saída registada · GPS impreciso (> 100 m) · dois clientes diferentes registados no mesmo local (< 30 m) no mesmo dia · visita a mais de 300 m do local do cliente na carteira (ou 500 m da 1.ª visita, se a carteira não tiver coordenadas) · cliente não confirmou na chamada.

## Instalação (≈ 20 minutos)

### 1. Base de dados (Google Sheet)
1. Crie um Google Sheet novo com a conta da empresa, ex.: “Rotas Bika+ — Dados”.
2. **Extensões → Apps Script**. Apague o conteúdo e cole o ficheiro `backend/Code.gs`. Guarde.
3. No menu de funções escolha `setup` → **Executar** → autorize. São criadas as folhas *Tecnicos, Objetivos, Visitas, Clientes, Confirmacoes, Config* e uma pasta no Drive para as fotos.
4. **Implementar → Nova implementação → Tipo: Aplicação Web**
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
   Copie o URL (termina em `/exec`).
5. Na folha **Tecnicos** escreva um técnico por linha: Nome · PIN (4 dígitos) · Zona · Ativo (Sim/Não).
6. Na folha **Config** troque o `SUPERVISOR_PIN` (por defeito `0000`).
7. (Opcional) Carregue a carteira de clientes no separador *Clientes* da conta do supervisor. Cada técnico recebe os clientes atribuídos a ele, ou sem técnico atribuído cuja *Localidade* seja igual à sua *Zona*.

> Sempre que alterar o `Code.gs`: Implementar → Gerir implementações → editar → Nova versão (o URL mantém-se).

### 2. Publicar a app
1. Abra `config.js` e cole o URL: `window.ROTAS_API_URL = "https://script.google.com/macros/s/…/exec";`
2. Coloque a pasta inteira (`index.html`, `config.js`, `manifest.json`, `sw.js`, ícones) num alojamento **HTTPS** — o GPS e o modo offline só funcionam em HTTPS. Opções gratuitas: GitHub Pages, Netlify, Cloudflare Pages, ou uma subpasta do site da empresa.
3. No telemóvel do técnico abra o endereço no Chrome → menu ⋮ → **Adicionar ao ecrã principal**. Fica com ícone, como uma app.
4. Primeiro login com internet (para descarregar a lista de técnicos). Depois funciona sem rede.

### 3. Telemóveis dos técnicos
- Localização ligada, em modo **alta precisão**; permitir localização ao Chrome/app.
- Em zonas sem rede o GPS continua a funcionar (não precisa de dados móveis). A primeira leitura em zona isolada pode demorar 30–60 s: aguardar ao ar livre.
- Não apagar os dados do navegador enquanto houver registos “Por enviar”.

## Integração na app Bika+
A equipa da Bika+ pode:
- **Abrir esta app a partir da Bika+** (botão/link para o endereço) — integração mais rápida; ou
- **Reutilizar a lógica**: modelo de dados (folha *Visitas*), regras de alertas (`computeAlerts` no `index.html`), cálculo de objetivos (`weekStats` / `pctOf`) e a API (`doPost` em `backend/Code.gs`: ações `login`, `sync`, `todos`, `clientes`, `objetivos`, `confirmar`).

Estrutura de uma visita enviada pela app:
```json
{ "id": "lx3k9a…", "tecnico": "Nome", "cliente": "Aviário X", "contacto": "+258 84…",
  "localidade": "Nampula", "tipo": "novo|existente",
  "entrada": {"ts": "2026-10-15T08:21:00Z", "lat": -15.1165, "lng": 39.2666, "acc": 12},
  "saida":   {"ts": "2026-10-15T09:02:00Z", "lat": -15.1166, "lng": 39.2667, "acc": 10},
  "sacos": 6, "comprou": true, "notas": "", "foto": "data:image/jpeg;base64,…" }
```

## Limites conhecidos
- Uma app web não deteta apps de “localização falsa” como uma app Android nativa. Os alertas (mesmo local, distância à 1.ª visita) e as chamadas aleatórias compensam; para controlo mais apertado, a versão nativa pode verificar *mock location*.
- A app regista a localização **quando o técnico carrega no botão** (chegada e saída). Não grava o percurso contínuo ao longo do dia.
- Segurança por PIN: adequada para uso interno; não guardar dados sensíveis nas notas.
- Informe os técnicos por escrito de que a localização é registada nos momentos de check-in/check-out, durante o horário de trabalho.
