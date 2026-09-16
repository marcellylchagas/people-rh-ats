# Como colocar o People RH ATS no ar (sem custo)

Este guia substitui os arquivos `DEPLOY_ONLINE.md` e `DEPLOY_PRODUCAO.md`, que
descreviam uma versão anterior do projeto (baseada em localStorage). Agora o
sistema tem backend real, com banco de dados PostgreSQL compartilhado e login
seguro. Siga os passos abaixo, na ordem.

## 1. Banco de dados (Neon — gratuito e permanente)

1. Crie uma conta em https://neon.tech (pode entrar com o GitHub).
2. Crie um novo projeto/banco de dados (qualquer nome, ex.: `people-rh`).
3. Na página do projeto, copie a **Connection string** (formato
   `postgresql://usuario:senha@ep-xxxxx.aws.neon.tech/nome?sslmode=require`).
   Guarde esse valor — ele vai virar a variável `DATABASE_URL`.

Você **não** precisa rodar o `db/schema.sql` manualmente: o servidor cria as
tabelas sozinho na primeira vez que é iniciado.

## 2. Atualizar o código no GitHub

No seu computador, dentro da pasta do projeto que já está no GitHub:

```bash
git add .
git commit -m "Backend real com PostgreSQL e login seguro"
git push
```

(Se preferir, pode simplesmente substituir os arquivos pelos desta pasta e
depois rodar os mesmos três comandos.)

## 3. Aplicação (Render — plano gratuito)

1. Crie uma conta em https://render.com (pode entrar com o GitHub).
2. Clique em **New +** → **Web Service**.
3. Selecione o repositório do projeto no GitHub.
4. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Em **Environment Variables**, adicione (uma por linha):
   - `DATABASE_URL` → a connection string do Neon (passo 1)
   - `ADMIN_EMAIL` → `contato.marcelly@outlook.com`
   - `ADMIN_PASSWORD` → uma senha forte, só sua
   - `SESSION_SECRET` → qualquer texto longo e aleatório
   - `PUBLIC_BASE_URL` → `https://marcellylourenco.com.br`
   - `NODE_ENV` → `production`
6. Clique em **Create Web Service** e aguarde o primeiro deploy terminar.
7. Teste a URL temporária que o Render vai gerar (algo como
   `https://people-rh-ats.onrender.com`) antes de apontar o domínio.

**Sobre o plano gratuito do Render:** ele não expira, mas o serviço "dorme"
depois de um tempo sem acessos e demora de 30 a 60 segundos para acordar na
próxima visita. Isso não afeta os dados (que ficam salvos no Neon).

## 4. Apontar o domínio marcellylourenco.com.br

1. No painel do Render, dentro do seu Web Service, vá em **Settings** →
   **Custom Domains** → adicione `marcellylourenco.com.br` (e, se quiser,
   `www.marcellylourenco.com.br`).
2. O Render vai te mostrar um registro DNS para criar (geralmente um `CNAME`
   apontando para algo como `SEU-SERVICO.onrender.com`, ou um `A record` com
   um IP, dependendo do caso).
3. No painel de DNS onde você registrou o domínio, crie exatamente esse
   registro.
4. Aguarde a propagação (pode levar de alguns minutos a algumas horas). O
   Render emite o certificado HTTPS automaticamente depois que o DNS aponta
   corretamente.

## 5. Testando depois do ar

- Acesse o site pelo domínio e confirme que a página inicial carrega.
- Crie um cadastro de candidato de teste, preencha o perfil e o DISC, e
  candidate-se a uma vaga de teste.
- Entre como administradora (com o e-mail e senha definidos no passo 3) e
  confirme que o candidato e a candidatura aparecem no painel.
- Depois, você pode excluir os dados de teste pelo próprio painel.

## O que mudou em relação à versão anterior

- Os dados agora ficam no banco (Neon), compartilhados entre todos os
  candidatos e visíveis só para você no painel administrativo.
- O login do candidato usa senha protegida (hash) armazenada no banco.
- O login administrativo é único (definido pelas variáveis `ADMIN_EMAIL` e
  `ADMIN_PASSWORD`) — não existe cadastro de outros administradores pela
  interface.
- Não é mais necessário rodar Docker/PostgreSQL localmente para publicar o
  projeto; o Dockerfile e o `docker-compose.yml` continuam no repositório
  como opção para quem quiser rodar tudo localmente no futuro.
