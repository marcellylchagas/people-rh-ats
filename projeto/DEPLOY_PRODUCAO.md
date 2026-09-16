# People RH ATS — publicação em produção

O pacote inclui Docker + PostgreSQL + configuração de proxy para o domínio `marcellylourenco.com.br`.

## O que falta para a publicação real

O código não consegue alterar DNS, servidor ou provedor de hospedagem sem as credenciais de acesso. Para colocar no ar de fato, é necessário um servidor/hosting que execute Node.js e PostgreSQL ou um serviço equivalente.

## Configuração

1. Copie `.env.example` para `.env`.
2. Defina `POSTGRES_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `SESSION_SECRET` com valores fortes e exclusivos.
3. Aponte o DNS de `marcellylourenco.com.br` para o servidor.
4. Suba `docker compose up -d --build`.
5. Configure HTTPS no proxy reverso usando o certificado do domínio.
6. Teste `https://marcellylourenco.com.br/api/health`.

### Acesso administrativo definitivo

O acesso temporário não deve ser usado em produção. Depois da publicação, o acesso definitivo deve ser definido pelas variáveis `ADMIN_EMAIL` e `ADMIN_PASSWORD` no servidor. Nunca coloque essa senha no HTML/JavaScript.

As credenciais devem permanecer somente no servidor. Em produção, use HTTPS e sessão protegida por cookie.

### Banco de dados

O PostgreSQL é inicializado com `db/schema.sql`. A tabela `app_state` está preparada para persistência centralizada do estado do ATS e `admin_users`/`sessions` para autenticação administrativa.

Importante: a publicação efetiva requer integrar as operações do frontend ao banco/rotas autenticadas. O domínio público existente não concede acesso ao servidor de hospedagem.
