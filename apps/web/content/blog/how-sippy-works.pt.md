A maioria das pessoas na América Latina que pede dólares não está fazendo uma aposta em cripto. Estão fazendo a conta normal da vida: um depósito de aluguel, uma fatura de freelancer, dinheiro para a mãe, uma poupança que ainda deveria valer alguma coisa no mês que vem.

A parte difícil não é querer dólares. A parte difícil é chegar até eles sem passar por um banco que diz não, um balcão de câmbio que tira uma fatia, ou uma configuração de carteira que começa com doze palavras aleatórias e um aviso para não perdê-las.

O Sippy parte de uma pergunta menor: e se a carteira de dólares começasse onde as pessoas já estão?

Dentro do WhatsApp.

Você diz oi. O Sippy cria uma carteira de dólares autocustodiada ligada ao seu número de telefone. Você não baixa outro app. Você não anota uma frase-semente. Para movimentar dinheiro, você manda mensagem do jeito que já manda.

## A versão de trinta segundos

Daí em diante, uma transferência pode ser assim de simples:

> envia 10 pra mãe

Um instante depois sua mãe tem dez dólares, e vocês dois recebem um recibo claro. Nada de nomes de rede, nem gas, nem endereços de contrato. Se você consegue mandar um áudio, você consegue mandar um dólar.

Os dólares são USDC, um dólar digital totalmente lastreado, na Arbitrum, uma rede rápida e barata construída sobre a Ethereum. Isso importa para o sistema. Não precisa importar para o usuário, do mesmo jeito que o SMTP importa para o e-mail sem aparecer na sua caixa de entrada.

## O que de fato acontece quando você aperta enviar

Por baixo da superfície amigável, uma mensagem percorre um caminho de pagamento simples:

1. Sua mensagem do WhatsApp chega ao Sippy.
2. Regras rápidas checam se é algo óbvio: saldo, ajuda, um envio padrão, um QR de pagamento.
3. Se for um envio, o Sippy identifica o destinatário, confirma o valor e checa se o comando é válido.
4. O USDC se movimenta na rede a partir da sua carteira.
5. O Sippy paga a pequena taxa de rede por você e envia um recibo para os dois lados.

Dois detalhes desse fluxo importam mais do que o resto.

O primeiro é a custódia. O Sippy usa contas inteligentes não custodiais construídas sobre a infraestrutura para desenvolvedores da Coinbase. Seu saldo não fica reunido em uma conta da empresa Sippy. O produto é a interface; a carteira é sua.

O segundo é a interpretação. Dinheiro pelo chat só funciona se o sistema conseguir entender mensagens humanas bagunçadas sem dar a um modelo permissão para gastar.

## A regra que mantém a IA longe do botão

O Sippy tem uma camada de IA. Ela ajuda a transformar "manda pro meu irmão o que eu devo a ele" numa intenção estruturada: uma transferência, para uma pessoa, de um valor.

Mas o modelo não movimenta os fundos. Ele pode ajudar a ler uma mensagem. Ele pode propor o que acha que o usuário quis dizer. O caminho real do dinheiro é tratado por regras determinísticas: código simples e auditável que checa o destinatário, o valor, o saldo e a ação permitida.

Cerca de 80% das mensagens do dia a dia nunca precisam do modelo. Checagens de saldo, envios comuns, contatos salvos e "ajuda" passam por regras rápidas em menos de um milissegundo. O modelo é só para os casos ambíguos da borda, e mesmo ali ele não tem a palavra final.

Essa separação é o motivo pelo qual uma interface de chat pode ser segura perto de dinheiro. Entender pode ser flexível. Gastar não pode.

## As regras de design que a gente não quebra

A gente aprendeu a maioria delas observando 45 pessoas num beta fechado tentarem enviar dinheiro de verdade para pessoas importantes para elas. Cada passo desajeitado apareceu na hora.

**Todo número na tela é uma promessa.** No começo, as pessoas podiam escolher um limite diário de $500 na configuração enquanto o sistema, sem avisar, as mantinha em $50 até que verificassem um e-mail. O número que elas escolheram e o número que elas de fato tinham eram diferentes. Isso significava que o pagamento de um jantar de $80 podia falhar sem um motivo claro. A gente consertou a tela para que ela diga a verdade: mostrar o limite que você tem, e mostrar o maior como disponível depois da verificação de e-mail. Num app de dinheiro, um número em que você não pode confiar é pior do que nenhum número.

**As pessoas não digitam como linhas de comando.** Dois mil pesos é "2mil", não "2000". Metade do continente escreve decimais com vírgula. As pessoas esticam palavras, derrubam acentos e abreviam. Um sistema que só aceita a versão de manual de um comando está, na verdade, dizendo às pessoas normais que elas estão erradas.

**Às vezes o produto é simples demais para acreditar.** Uma das primeiras surpresas foram pessoas que não conseguiam encontrar a carteira. Não porque estava escondida, mas porque era tão simples que elas não confiavam que fosse real. Elas ficavam esperando um app para instalar, um painel para fazer login, um número de conta para anotar. Quando a resposta honesta era "está bem aqui, neste chat, ligada ao seu número", algumas pessoas não conseguiam situar onde o dinheiro delas de fato morava. A gente aprendeu a dizer isso de forma simples: não há mais nada para configurar, e esse é o ponto, não um passo que faltou.

**Um passo pulado ainda precisa de um lugar para cair.** A gente simplificou bastante o onboarding. O e-mail é opcional. As telas legais ficam fora do caminho rápido. Deve haver o mínimo possível de toques entre "oi Sippy" e uma carteira funcionando. Mas cortar um passo só funciona se você sabe exatamente onde o usuário cai depois. Subtrair é trabalho de produto, não só apagar.

**Os substantivos de cripto pertencem ao nosso código, não ao chat.** Uma conversa normal com o Sippy não deveria pedir que você entenda gas, L2s, bridges ou aprovações de contrato. Esses são problemas nossos para resolver.

## Funciona?

Até agora, sim, do único jeito que importa neste estágio: pessoas de verdade usaram com dinheiro de verdade.

Estamos no começo, e não vamos fingir o contrário. Mas a tração não é imaginária. São pessoas, a maioria na Colombia, enviando dólares para a família, amigos, comerciantes e para si mesmas por um chat. Essa é a coisa que a gente precisava provar primeiro: que alguém sem nenhum interesse em cripto ainda assim vai usar uma conversa para movimentar um dólar de verdade.

## Para quem é

A pessoa que manda parte do salário para casa. O freelancer que fatura no exterior e quer guardar dólares sem um banco americano. O comerciante que prefere receber um dólar digital a se preocupar com troco. A família tentando poupar em algo que mantém o valor.

Nenhum deles deveria ter que virar usuário de cripto para conseguir isso. Com o Sippy, eles podem começar com uma mensagem.

[Diga oi para o Sippy no WhatsApp](https://wa.me/14722261449). Leva uns trinta segundos. Aí você tem uma carteira de dólares onde as suas conversas sobre dinheiro já acontecem.

Mas como funciona é a história pequena. A maior é por que um chat, uma IA que nunca tem permissão para movimentar seu dinheiro, e uma rede aberta são a combinação que finalmente coloca o dólar ao alcance das pessoas que sempre ficaram de fora por causa do preço — e por que as que mais precisam dele primeiro não estão atrás de cripto de jeito nenhum. É sobre isso que a próxima parte fala.
