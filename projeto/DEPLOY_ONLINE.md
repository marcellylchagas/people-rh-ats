# Publicação online — People RH ATS

O pacote está pronto para ser executado em um servidor Node.js 18+.

## Importante antes de divulgar
O domínio `https://marcellylourenco.com.br` não está apontando para este servidor neste momento. A consulta externa realizada em 15/09/2026 retornou erro 502.

Também é importante observar que a área administrativa/candidatos deste pacote ainda usa armazenamento local do navegador (`localStorage`). Isso significa que colocar o pacote em uma hospedagem pública **não transforma automaticamente os cadastros em um banco compartilhado entre computadores**. Para uma operação real com vários candidatos e um administrador, a próxima etapa é ligar o ATS a um banco de dados e autenticação de servidor.

## Publicação técnica
1. Hospedar o projeto em um servidor com Node.js 18+.
2. Executar `npm install` e `npm start`.
3. Configurar HTTPS.
4. Apontar `marcellylourenco.com.br` para o servidor/proxy.
5. Validar `https://marcellylourenco.com.br/vagas`.

## Acesso temporário x definitivo
O acesso administrativo atual é de demonstração/local. Não deve ser usado como credencial definitiva em produção.

Depois da publicação, o correto é retirar o acesso temporário e criar uma autenticação administrativa permanente no servidor, com senha armazenada de forma segura (hash), e não no código do navegador.
