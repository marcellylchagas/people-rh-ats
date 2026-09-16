# People RH ATS — v37

## Ajustes desta versão
- Na entrevista por IA, o botão de gravação fica bloqueado até a Clara terminar de ler cada pergunta.
- A voz da Clara é interrompida ao sair, fechar ou ocultar a página.
- O reconhecimento de voz não é reiniciado automaticamente entre perguntas, evitando novos pedidos de permissão do microfone durante a mesma entrevista.
- Parecer com IA agora é **editável antes de ser salvo**: o texto gerado aparece em editor, e o administrador precisa clicar em **Salvar parecer** antes de usar o PDF.
- O PDF continua permitindo revisar o parecer antes do download; somente o parecer é tratado de forma personalizada no PDF.
- Clara permanece **100% estática**, sem animação de boca, corpo ou ondas durante o treinamento por IA.
- A voz da Clara aceita somente uma voz feminina identificada em português; a aplicação não usa uma voz masculina como fallback. A voz disponível continua dependendo do navegador/sistema operacional.
- Nenhuma outra funcionalidade foi alterada.
- IA interna sem GPT/OpenAI.
- Portal público `/vagas`.
- Links públicos das vagas usam `https://marcellylourenco.com.br` quando o ATS estiver publicado nesse domínio; em localhost continuam usando o endereço local para testes.

## Execução
Use Node.js 18+ e execute `INICIAR.bat` no Windows. O sistema abre em `http://localhost:3000`.

## Voz da Clara
A aplicação bloqueia fallback para voz masculina. Se o navegador/Windows não disponibilizar uma voz feminina em português, a Clara não fará a leitura até que uma voz feminina esteja disponível. Isso evita que a aplicação escolha uma voz masculina.

## Domínio marcellylourenco.com.br
O código está preparado para funcionar em `https://marcellylourenco.com.br`, mas a ligação real do domínio exige acesso ao provedor de hospedagem/DNS e não pode ser concluída apenas com o endereço público do domínio.

Para publicar o ATS:
1. Suba este projeto em um servidor com Node.js 18+.
2. Execute `npm install` e `npm start`.
3. Faça o domínio `marcellylourenco.com.br` apontar para o servidor no DNS.
4. Configure HTTPS/SSL no servidor ou no proxy reverso.
5. Confirme `https://marcellylourenco.com.br/vagas`.

Se o domínio já estiver em um provedor, é necessário acesso ao painel DNS/hospedagem para executar esses passos.
